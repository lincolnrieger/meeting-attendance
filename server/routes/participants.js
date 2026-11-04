/**
 * /api/participants — board member management and individual attendance records.
 */
const express = require('express');
const { validateParticipant, assertValid, HttpError, ValidationError } = require('../validation');
const { HELD_SQL, AGG_SQL, withRate, params } = require('../stats');

const COLUMNS = ['first_name', 'last_name', 'date_of_birth', 'email', 'phone', 'position', 'date_joined', 'status', 'photo', 'notes'];

module.exports = function participantsRouter(db) {
  const router = express.Router();

  const getById = db.prepare('SELECT * FROM participants WHERE id = ?');
  const emailTaken = db.prepare('SELECT id FROM participants WHERE email = ? AND id != ?');

  function loadOr404(id) {
    const p = getById.get(Number(id));
    if (!p) throw new HttpError(404, 'Participant not found.');
    return p;
  }

  function checkEmailUnique(email, id = 0) {
    if (emailTaken.get(email, id)) throw new ValidationError({ email: 'Another participant already uses this email address.' });
  }

  // List with per-person attendance summary (held meetings only).
  router.get('/', (req, res) => {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '');
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
    const rows = db.prepare(`
      SELECT p.*, ${AGG_SQL}
      FROM participants p
      LEFT JOIN (
        SELECT a.* FROM attendance a JOIN meetings m ON m.id = a.meeting_id WHERE ${HELD_SQL}
      ) a ON a.participant_id = p.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY p.id
      ORDER BY p.status = 'inactive', p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE
    `).all(p);
    res.json({ participants: rows.map(withRate) });
  });

  // Full profile: personal details, totals and chronological history.
  router.get('/:id', (req, res) => {
    const participant = loadOr404(req.params.id);
    const p = params({ id: participant.id });
    const summary = withRate(db.prepare(`
      SELECT ${AGG_SQL}
      FROM attendance a JOIN meetings m ON m.id = a.meeting_id
      WHERE a.participant_id = @id AND ${HELD_SQL}
    `).get(p));
    const history = db.prepare(`
      SELECT m.id AS meeting_id, m.title, m.date, m.start_time, m.end_time, m.location, m.status AS meeting_status,
             a.status, a.notes, a.recorded_at,
             CASE WHEN ${HELD_SQL} THEN 1 ELSE 0 END AS held
      FROM attendance a JOIN meetings m ON m.id = a.meeting_id
      WHERE a.participant_id = @id
      ORDER BY m.date DESC, m.start_time DESC
    `).all(p);
    res.json({ participant, summary, history });
  });

  router.post('/', (req, res) => {
    const { value, errors } = validateParticipant(req.body || {});
    assertValid(errors);
    checkEmailUnique(value.email);
    const info = db.prepare(`
      INSERT INTO participants (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})
    `).run(value);
    res.status(201).json({ participant: getById.get(info.lastInsertRowid) });
  });

  router.put('/:id', (req, res) => {
    const existing = loadOr404(req.params.id);
    const { value, errors } = validateParticipant(req.body || {});
    assertValid(errors);
    checkEmailUnique(value.email, existing.id);
    db.prepare(`
      UPDATE participants SET ${COLUMNS.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...value, id: existing.id });
    res.json({ participant: getById.get(existing.id) });
  });

  router.delete('/:id', (req, res) => {
    const existing = loadOr404(req.params.id);
    // Attendance records are removed through ON DELETE CASCADE.
    db.prepare('DELETE FROM participants WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  });

  /**
   * Bulk import. Body: { rows: [{ first_name, last_name, email, ... }] }
   * Rows are validated individually; invalid rows and rows whose email already
   * exists are skipped and reported back with the reason.
   */
  router.post('/import', (req, res) => {
    const rows = req.body && req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import.');
    if (rows.length > 2000) throw new HttpError(400, 'Imports are limited to 2000 rows at a time.');

    const insert = db.prepare(`INSERT INTO participants (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})`);
    const created = [];
    const skipped = [];
    const seen = new Set();

    db.transaction(() => {
      rows.forEach((raw, i) => {
        const row = { status: 'active', ...raw };
        if (row.status) row.status = String(row.status).trim().toLowerCase();
        delete row.photo;
        const { value, errors } = validateParticipant(row);
        const line = i + 2; // header is line 1 of the CSV
        if (Object.keys(errors).length) {
          skipped.push({ line, name: `${value.first_name} ${value.last_name}`.trim(), reason: Object.values(errors).join(' ') });
          return;
        }
        if (seen.has(value.email) || emailTaken.get(value.email, 0)) {
          skipped.push({ line, name: `${value.first_name} ${value.last_name}`, reason: `Email ${value.email} already exists.` });
          return;
        }
        seen.add(value.email);
        const info = insert.run(value);
        created.push(info.lastInsertRowid);
      });
    })();

    res.json({ created: created.length, skipped });
  });

  return router;
};
