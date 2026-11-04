/**
 * /api/participants — board member management and individual attendance records.
 */
const { Hono } = require('hono');
const { validateParticipant, assertValid, HttpError, ValidationError } = require('../validation');
const { HELD_SQL, AGG_SQL, withRate, params } = require('../stats');
const { readJson } = require('../auth');
const { multiInsert } = require('../database');

const COLUMNS = ['first_name', 'last_name', 'date_of_birth', 'email', 'phone', 'position', 'date_joined', 'status', 'photo', 'notes'];

async function loadOr404(db, id) {
  const p = await db.first('SELECT * FROM participants WHERE id = ?', [Number(id)]);
  if (!p) throw new HttpError(404, 'Participant not found.');
  return p;
}

async function checkEmailUnique(db, email, id = 0) {
  if (await db.first('SELECT id FROM participants WHERE email = ? AND id != ?', [email, id])) {
    throw new ValidationError({ email: 'Another participant already uses this email address.' });
  }
}

module.exports = function participantsRoutes() {
  const app = new Hono();

  // List with per-person attendance summary (held meetings only).
  app.get('/', async (c) => {
    const search = String(c.req.query('search') || '').trim();
    const status = String(c.req.query('status') || '');
    const where = [];
    const p = params();
    if (search) {
      where.push(`(p.first_name || ' ' || p.last_name LIKE @search OR p.email LIKE @search OR p.position LIKE @search)`);
      p.search = `%${search}%`;
    }
    if (status === 'active' || status === 'inactive') {
      where.push('p.status = @status');
      p.status = status;
    }
    const rows = await c.var.db.all(`
      SELECT p.*, ${AGG_SQL}
      FROM participants p
      LEFT JOIN (
        SELECT a.* FROM attendance a JOIN meetings m ON m.id = a.meeting_id WHERE ${HELD_SQL}
      ) a ON a.participant_id = p.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY p.id
      ORDER BY p.status = 'inactive', p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE
    `, p);
    return c.json({ participants: rows.map(withRate) });
  });

  // Full profile: personal details, totals and chronological history.
  app.get('/:id', async (c) => {
    const db = c.var.db;
    const participant = await loadOr404(db, c.req.param('id'));
    const p = params({ id: participant.id });
    const summary = withRate(await db.first(`
      SELECT ${AGG_SQL}
      FROM attendance a JOIN meetings m ON m.id = a.meeting_id
      WHERE a.participant_id = @id AND ${HELD_SQL}
    `, p));
    const history = await db.all(`
      SELECT m.id AS meeting_id, m.title, m.date, m.start_time, m.end_time, m.location, m.status AS meeting_status,
             a.status, a.notes, a.recorded_at,
             CASE WHEN ${HELD_SQL} THEN 1 ELSE 0 END AS held
      FROM attendance a JOIN meetings m ON m.id = a.meeting_id
      WHERE a.participant_id = @id
      ORDER BY m.date DESC, m.start_time DESC
    `, p);
    return c.json({ participant, summary, history });
  });

  app.post('/', async (c) => {
    const db = c.var.db;
    const { value, errors } = validateParticipant(await readJson(c));
    assertValid(errors);
    await checkEmailUnique(db, value.email);
    const { lastId } = await db.run(
      `INSERT INTO participants (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((col) => '@' + col).join(', ')})`,
      value,
    );
    return c.json({ participant: await loadOr404(db, lastId) }, 201);
  });

  app.put('/:id', async (c) => {
    const db = c.var.db;
    const existing = await loadOr404(db, c.req.param('id'));
    const { value, errors } = validateParticipant(await readJson(c));
    assertValid(errors);
    await checkEmailUnique(db, value.email, existing.id);
    await db.run(
      `UPDATE participants SET ${COLUMNS.map((col) => `${col} = @${col}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`,
      { ...value, id: existing.id },
    );
    return c.json({ participant: await loadOr404(db, existing.id) });
  });

  app.delete('/:id', async (c) => {
    const existing = await loadOr404(c.var.db, c.req.param('id'));
    // Attendance records are removed through ON DELETE CASCADE.
    await c.var.db.run('DELETE FROM participants WHERE id = ?', [existing.id]);
    return c.json({ ok: true });
  });

  /**
   * Bulk import. Body: { rows: [{ first_name, last_name, email, ... }] }
   * Rows are validated individually; invalid rows and rows whose email already
   * exists are skipped and reported back with the reason. Valid rows are
   * inserted together in one atomic batch.
   */
  app.post('/import', async (c) => {
    const db = c.var.db;
    const { rows } = await readJson(c);
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import.');
    if (rows.length > 2000) throw new HttpError(400, 'Imports are limited to 2000 rows at a time.');

    const existing = new Set((await db.all('SELECT lower(email) AS email FROM participants')).map((r) => r.email));
    const toInsert = [];
    const skipped = [];

    rows.forEach((raw, i) => {
      const row = { status: 'active', ...raw };
      if (row.status) row.status = String(row.status).trim().toLowerCase();
      delete row.photo;
      const { value, errors } = validateParticipant(row);
      const line = i + 2; // header is line 1 of the CSV
      const name = `${value.first_name} ${value.last_name}`.trim();
      if (Object.keys(errors).length) return skipped.push({ line, name, reason: Object.values(errors).join(' ') });
      if (existing.has(value.email)) return skipped.push({ line, name, reason: `Email ${value.email} already exists.` });
      existing.add(value.email);
      toInsert.push(value);
    });

    if (toInsert.length) await db.batch(multiInsert('participants', COLUMNS, toInsert, { chunk: 100 }));
    return c.json({ created: toInsert.length, skipped });
  });

  return app;
};
