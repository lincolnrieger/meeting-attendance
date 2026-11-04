/**
 * /api/meetings — meeting management, invitations and the attendance register.
 */
const { Hono } = require('hono');
const { validateMeeting, assertValid, HttpError, ValidationError, ATTENDANCE_STATUSES, MEETING_STATUSES } = require('../validation');
const { HELD_SQL, UPCOMING_SQL, AGG_SQL, withRate, params } = require('../stats');
const { readJson } = require('../auth');

const COLUMNS = ['title', 'date', 'start_time', 'end_time', 'location', 'description', 'status'];

async function loadOr404(db, id) {
  const m = await db.first('SELECT * FROM meetings WHERE id = ?', [Number(id)]);
  if (!m) throw new HttpError(404, 'Meeting not found.');
  return m;
}

async function summaryFor(db, meetingId) {
  return withRate(await db.first(`SELECT ${AGG_SQL} FROM attendance a WHERE a.meeting_id = ?`, [meetingId]));
}

/**
 * Statements that make the invitation list equal to `ids`. Removing an
 * invitee also removes their attendance record. `ids` are validated integers.
 */
async function inviteeStatements(db, meetingId, ids) {
  const known = new Set((await db.all('SELECT id FROM participants')).map((r) => r.id));
  if (ids.some((id) => !known.has(id))) throw new ValidationError({ participant_ids: 'One or more selected participants no longer exist.' });
  const current = new Set((await db.all('SELECT participant_id FROM attendance WHERE meeting_id = ?', [meetingId])).map((r) => r.participant_id));
  const wanted = new Set(ids);
  const remove = [...current].filter((id) => !wanted.has(id));
  const add = [...wanted].filter((id) => !current.has(id));
  const statements = [];
  if (remove.length) statements.push([`DELETE FROM attendance WHERE meeting_id = ? AND participant_id IN (${remove.map(Number).join(',')})`, [meetingId]]);
  if (add.length) statements.push([`INSERT OR IGNORE INTO attendance (meeting_id, participant_id) VALUES ${add.map((id) => `(${Number(meetingId)}, ${Number(id)})`).join(', ')}`]);
  return statements;
}

module.exports = function meetingsRoutes() {
  const app = new Hono();

  // List meetings. scope = upcoming | past | cancelled | all
  app.get('/', async (c) => {
    const scope = String(c.req.query('scope') || 'all');
    const search = String(c.req.query('search') || '').trim();
    const where = [];
    const p = params();
    if (scope === 'upcoming') where.push(UPCOMING_SQL);
    else if (scope === 'past') where.push(HELD_SQL);
    else if (scope === 'cancelled') where.push(`m.status = 'cancelled'`);
    if (search) {
      where.push('(m.title LIKE @search OR m.location LIKE @search)');
      p.search = `%${search}%`;
    }
    const order = scope === 'upcoming' ? 'm.date ASC, m.start_time ASC' : 'm.date DESC, m.start_time DESC';
    const rows = await c.var.db.all(`
      SELECT m.*, CASE WHEN ${HELD_SQL} THEN 1 ELSE 0 END AS held, ${AGG_SQL}
      FROM meetings m LEFT JOIN attendance a ON a.meeting_id = m.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY m.id
      ORDER BY ${order}
    `, p);
    return c.json({ meetings: rows.map(withRate) });
  });

  // Meeting details with the full attendance register.
  app.get('/:id', async (c) => {
    const db = c.var.db;
    const meeting = await loadOr404(db, c.req.param('id'));
    const held = await db.value(`SELECT ${HELD_SQL} FROM meetings m WHERE m.id = @id`, params({ id: meeting.id }));
    const attendees = await db.all(`
      SELECT p.id AS participant_id, p.first_name, p.last_name, p.email, p.position, p.status AS participant_status,
             p.photo, a.status, a.notes, a.recorded_at
      FROM attendance a JOIN participants p ON p.id = a.participant_id
      WHERE a.meeting_id = ?
      ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE
    `, [meeting.id]);
    return c.json({ meeting: { ...meeting, held }, attendees, summary: await summaryFor(db, meeting.id) });
  });

  app.post('/', async (c) => {
    const db = c.var.db;
    const { value, participantIds, errors } = validateMeeting(await readJson(c));
    assertValid(errors);
    const { lastId } = await db.run(`INSERT INTO meetings (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((col) => '@' + col).join(', ')})`, value);
    try {
      await db.batch(await inviteeStatements(db, lastId, participantIds || []));
    } catch (err) {
      await db.run('DELETE FROM meetings WHERE id = ?', [lastId]); // keep create all-or-nothing
      throw err;
    }
    return c.json({ meeting: await loadOr404(db, lastId) }, 201);
  });

  app.put('/:id', async (c) => {
    const db = c.var.db;
    const existing = await loadOr404(db, c.req.param('id'));
    const { value, participantIds, errors } = validateMeeting({ status: existing.status, ...(await readJson(c)) });
    assertValid(errors);
    await db.batch([
      [`UPDATE meetings SET ${COLUMNS.map((col) => `${col} = @${col}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`, { ...value, id: existing.id }],
      ...(participantIds ? await inviteeStatements(db, existing.id, participantIds) : []),
    ]);
    return c.json({ meeting: await loadOr404(db, existing.id) });
  });

  // Change only the status (cancel, mark completed, reinstate).
  app.patch('/:id/status', async (c) => {
    const db = c.var.db;
    const existing = await loadOr404(db, c.req.param('id'));
    const status = String((await readJson(c)).status || '');
    if (!MEETING_STATUSES.includes(status)) throw new HttpError(400, 'Invalid meeting status.');
    await db.run(`UPDATE meetings SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, existing.id]);
    return c.json({ meeting: await loadOr404(db, existing.id) });
  });

  app.delete('/:id', async (c) => {
    const existing = await loadOr404(c.var.db, c.req.param('id'));
    await c.var.db.run('DELETE FROM meetings WHERE id = ?', [existing.id]);
    return c.json({ ok: true });
  });

  // ---- Attendance register -------------------------------------------------

  function assertEditable(meeting) {
    if (meeting.status === 'cancelled') throw new HttpError(409, 'Attendance cannot be recorded for a cancelled meeting.');
  }

  // Record (or clear, with status null) one participant's attendance.
  app.put('/:id/attendance/:participantId', async (c) => {
    const db = c.var.db;
    const meeting = await loadOr404(db, c.req.param('id'));
    assertEditable(meeting);
    const pid = Number(c.req.param('participantId'));
    const body = await readJson(c);
    const row = await db.first('SELECT * FROM attendance WHERE meeting_id = ? AND participant_id = ?', [meeting.id, pid]);
    if (!row) throw new HttpError(404, 'This participant is not invited to the meeting.');

    const status = body.status === undefined ? row.status : body.status || null;
    if (status !== null && !ATTENDANCE_STATUSES.includes(status)) throw new HttpError(400, 'Invalid attendance status.');
    const notes = body.notes === undefined ? row.notes : String(body.notes || '').trim() || null;
    if (notes && notes.length > 1000) throw new ValidationError({ notes: 'Notes are limited to 1000 characters.' });

    await db.run(`
      UPDATE attendance SET status = @status, notes = @notes,
        recorded_at = CASE WHEN @status IS NULL THEN NULL ELSE datetime('now') END
      WHERE meeting_id = @meeting AND participant_id = @pid
    `, { status, notes, meeting: meeting.id, pid });
    const record = await db.first('SELECT * FROM attendance WHERE meeting_id = ? AND participant_id = ?', [meeting.id, pid]);
    return c.json({ record, summary: await summaryFor(db, meeting.id) });
  });

  // Set many records at once, e.g. "mark everyone present".
  // Body: { status: 'present', only_unrecorded: boolean }
  app.post('/:id/attendance/bulk', async (c) => {
    const db = c.var.db;
    const meeting = await loadOr404(db, c.req.param('id'));
    assertEditable(meeting);
    const { status = null, only_unrecorded } = await readJson(c);
    if (status !== null && !ATTENDANCE_STATUSES.includes(status)) throw new HttpError(400, 'Invalid attendance status.');
    const { changes } = await db.run(`
      UPDATE attendance SET status = @status, recorded_at = CASE WHEN @status IS NULL THEN NULL ELSE datetime('now') END
      WHERE meeting_id = @meeting ${only_unrecorded ? 'AND status IS NULL' : ''}
    `, { status, meeting: meeting.id });
    return c.json({ updated: changes, summary: await summaryFor(db, meeting.id) });
  });

  return app;
};
