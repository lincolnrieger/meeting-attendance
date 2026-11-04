/**
 * /api/participants — participant management and individual attendance records.
 */
const { Hono } = require('hono');
const { validateParticipant, assertValid, HttpError, ValidationError } = require('../validation');
const { HELD_SQL, AGG_SQL, withRate, params } = require('../stats');
const { readJson } = require('../auth');
const { multiInsert } = require('../database');
const { FIELD_TYPES, MAX_FIELDS, listFields, validateCustomValues, hydrate } = require('../custom-fields');

const COLUMNS = ['first_name', 'last_name', 'date_of_birth', 'email', 'phone', 'position', 'date_joined', 'status', 'photo', 'notes', 'custom_values'];

async function loadOr404(db, id) {
  const p = await db.first('SELECT * FROM participants WHERE id = ?', [Number(id)]);
  if (!p) throw new HttpError(404, 'Participant not found.');
  return hydrate(p);
}

/** Validate the standard fields plus the custom field values in `input.custom`. */
function validateWithCustom(input, fields) {
  const { value, errors } = validateParticipant(input);
  const custom = validateCustomValues(fields, input.custom);
  value.custom_values = JSON.stringify(custom.value);
  return { value, errors: { ...errors, ...custom.errors } };
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
      where.push(`(p.first_name || ' ' || p.last_name LIKE @search OR p.email LIKE @search OR p.position LIKE @search OR p.custom_values LIKE @search)`);
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
    return c.json({ participants: rows.map((r) => withRate(hydrate(r))) });
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
    const { value, errors } = validateWithCustom(await readJson(c), await listFields(db));
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
    const { value, errors } = validateWithCustom(await readJson(c), await listFields(db));
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
   * Bulk import (CSV or spreadsheet, parsed in the browser).
   * Body: {
   *   rows: [{ first_name, last_name, email, ..., custom: { <field id | new key>: value } }],
   *   new_fields: [{ key: 'new:1', label, type }]   // custom fields to create
   * }
   * Rows are validated individually; invalid rows and rows whose email already
   * exists are skipped and reported back with the reason. New fields are only
   * created when at least one row is imported. Everything is written in one
   * atomic batch.
   */
  app.post('/import', async (c) => {
    const db = c.var.db;
    const body = await readJson(c);
    const rows = body.rows;
    const newFieldsIn = Array.isArray(body.new_fields) ? body.new_fields : [];
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import.');
    if (rows.length > 2000) throw new HttpError(400, 'Imports are limited to 2000 rows at a time.');

    // Resolve new fields. A "new" field whose name matches an existing field is
    // merged into that field rather than duplicated.
    const fields = await listFields(db);
    const byLabel = new Map(fields.map((f) => [f.label.toLowerCase(), f]));
    let nextId = fields.reduce((m, f) => Math.max(m, f.id), 0) + 1;
    let nextOrder = fields.reduce((m, f) => Math.max(m, f.sort_order), 0) + 1;
    const keyToId = new Map();
    const created = [];
    for (const nf of newFieldsIn) {
      const key = String(nf?.key ?? '');
      const label = String(nf?.label ?? '').trim().replace(/\s+/g, ' ');
      const type = FIELD_TYPES.includes(nf?.type) ? nf.type : 'text';
      if (!key || !label) throw new HttpError(400, 'Every new field needs a name.');
      if (label.length > 60) throw new HttpError(400, `Field name "${label.slice(0, 30)}…" is too long (60 characters max).`);
      const existing = byLabel.get(label.toLowerCase());
      if (existing) { keyToId.set(key, existing.id); continue; }
      const f = { id: nextId++, label, type, sort_order: nextOrder++ };
      created.push(f);
      byLabel.set(label.toLowerCase(), f);
      keyToId.set(key, f.id);
    }
    if (fields.length + created.length > MAX_FIELDS) throw new HttpError(400, `You can have up to ${MAX_FIELDS} custom fields.`);
    const allFields = [...fields, ...created];

    const existingEmails = new Set((await db.all('SELECT lower(email) AS email FROM participants')).map((r) => r.email));
    const toInsert = [];
    const skipped = [];

    rows.forEach((raw, i) => {
      const row = { status: 'active', ...raw };
      if (row.status) row.status = String(row.status).trim().toLowerCase();
      delete row.photo;
      // Map custom values from "new:…" keys to the real field ids.
      const custom = {};
      for (const [k, v] of Object.entries(raw.custom && typeof raw.custom === 'object' ? raw.custom : {})) {
        custom[keyToId.has(k) ? keyToId.get(k) : k] = v;
      }
      row.custom = custom;
      const { value, errors } = validateWithCustom(row, allFields);
      const line = Number.isInteger(raw.line) ? raw.line : i + 2; // header is line 1 of a CSV
      const name = `${value.first_name} ${value.last_name}`.trim();
      if (Object.keys(errors).length) return skipped.push({ line, name, reason: Object.values(errors).join(' ') });
      if (existingEmails.has(value.email)) return skipped.push({ line, name, reason: `Email ${value.email} already exists.` });
      existingEmails.add(value.email);
      toInsert.push(value);
    });

    if (toInsert.length) {
      await db.batch([
        ...(created.length ? multiInsert('custom_fields', ['id', 'label', 'type', 'sort_order'], created) : []),
        ...multiInsert('participants', COLUMNS, toInsert, { chunk: 100 }),
      ]);
    }
    return c.json({ created: toInsert.length, skipped, fields_created: toInsert.length ? created.length : 0 });
  });

  return app;
};
