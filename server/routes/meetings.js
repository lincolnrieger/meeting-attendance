/**
 * /api/meetings — meeting management, invitations and the attendance register.
 */
const express = require('express');
const { validateMeeting, assertValid, HttpError, ValidationError, ATTENDANCE_STATUSES, MEETING_STATUSES } = require('../validation');
const { HELD_SQL, UPCOMING_SQL, AGG_SQL, withRate, params } = require('../stats');

const COLUMNS = ['title', 'date', 'start_time', 'end_time', 'location', 'description', 'status'];

module.exports = function meetingsRouter(db) {
  const router = express.Router();

  const getById = db.prepare('SELECT * FROM meetings WHERE id = ?');

  function loadOr404(id) {
    const m = getById.get(Number(id));
    if (!m) throw new HttpError(404, 'Meeting not found.');
    return m;
  }

  function summaryFor(meetingId) {
    return withRate(db.prepare(`SELECT ${AGG_SQL} FROM attendance a WHERE a.meeting_id = ?`).get(meetingId));
  }

  /** Replace the invitation list. Removing an invitee also removes their attendance record. */
  function syncInvitees(meetingId, ids) {
    const known = new Set(db.prepare('SELECT id FROM participants').pluck().all());
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) throw new ValidationError({ participant_ids: 'One or more selected participants no longer exist.' });
    const current = new Set(db.prepare('SELECT participant_id FROM attendance WHERE meeting_id = ?').pluck().all(meetingId));
    const wanted = new Set(ids);
    const del = db.prepare('DELETE FROM attendance WHERE meeting_id = ? AND participant_id = ?');
    const ins = db.prepare('INSERT OR IGNORE INTO attendance (meeting_id, participant_id) VALUES (?, ?)');
    for (const id of current) if (!wanted.has(id)) del.run(meetingId, id);
    for (const id of wanted) if (!current.has(id)) ins.run(meetingId, id);
  }

  // List meetings. scope = upcoming | past | cancelled | all
  router.get('/', (req, res) => {
    const scope = String(req.query.scope || 'all');
    const search = String(req.query.search || '').trim();
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
    const rows = db.prepare(`
      SELECT m.*, CASE WHEN ${HELD_SQL} THEN 1 ELSE 0 END AS held, ${AGG_SQL}
      FROM meetings m LEFT JOIN attendance a ON a.meeting_id = m.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY m.id
      ORDER BY ${order}
    `).all(p);
    res.json({ meetings: rows.map(withRate) });
  });

  // Meeting details with the full attendance register.
  router.get('/:id', (req, res) => {
    const meeting = loadOr404(req.params.id);
    const held = db.prepare(`SELECT ${HELD_SQL} AS held FROM meetings m WHERE m.id = @id`).get(params({ id: meeting.id })).held;
    const attendees = db.prepare(`
      SELECT p.id AS participant_id, p.first_name, p.last_name, p.email, p.position, p.status AS participant_status,
             p.photo, a.status, a.notes, a.recorded_at
      FROM attendance a JOIN participants p ON p.id = a.participant_id
      WHERE a.meeting_id = ?
      ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE
    `).all(meeting.id);
    res.json({ meeting: { ...meeting, held }, attendees, summary: summaryFor(meeting.id) });
  });

  router.post('/', (req, res) => {
    const { value, participantIds, errors } = validateMeeting(req.body || {});
    assertValid(errors);
    const id = db.transaction(() => {
      const info = db.prepare(`INSERT INTO meetings (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})`).run(value);
      syncInvitees(info.lastInsertRowid, participantIds || []);
      return info.lastInsertRowid;
    })();
    res.status(201).json({ meeting: getById.get(id) });
  });

  router.put('/:id', (req, res) => {
    const existing = loadOr404(req.params.id);
    const { value, participantIds, errors } = validateMeeting({ status: existing.status, ...req.body });
    assertValid(errors);
    db.transaction(() => {
      db.prepare(`UPDATE meetings SET ${COLUMNS.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`)
        .run({ ...value, id: existing.id });
      if (participantIds) syncInvitees(existing.id, participantIds);
    })();
    res.json({ meeting: getById.get(existing.id) });
  });

  // Change only the status (cancel, mark completed, reinstate).
  router.patch('/:id/status', (req, res) => {
    const existing = loadOr404(req.params.id);
    const status = String((req.body || {}).status || '');
    if (!MEETING_STATUSES.includes(status)) throw new HttpError(400, 'Invalid meeting status.');
    db.prepare(`UPDATE meetings SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, existing.id);
    res.json({ meeting: getById.get(existing.id) });
  });

  router.delete('/:id', (req, res) => {
    const existing = loadOr404(req.params.id);
    db.prepare('DELETE FROM meetings WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  });

  // ---- Attendance register -------------------------------------------------

  function assertEditable(meeting) {
    if (meeting.status === 'cancelled') throw new HttpError(409, 'Attendance cannot be recorded for a cancelled meeting.');
  }

  // Record (or clear, with status null) one participant's attendance.
  router.put('/:id/attendance/:participantId', (req, res) => {
    const meeting = loadOr404(req.params.id);
    assertEditable(meeting);
    const pid = Number(req.params.participantId);
    const body = req.body || {};
    const row = db.prepare('SELECT * FROM attendance WHERE meeting_id = ? AND participant_id = ?').get(meeting.id, pid);
    if (!row) throw new HttpError(404, 'This participant is not invited to the meeting.');

    const status = body.status === undefined ? row.status : body.status || null;
    if (status !== null && !ATTENDANCE_STATUSES.includes(status)) throw new HttpError(400, 'Invalid attendance status.');
    let notes = body.notes === undefined ? row.notes : String(body.notes || '').trim() || null;
    if (notes && notes.length > 1000) throw new ValidationError({ notes: 'Notes are limited to 1000 characters.' });

    db.prepare(`
      UPDATE attendance SET status = ?, notes = ?, recorded_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END
      WHERE meeting_id = ? AND participant_id = ?
    `).run(status, notes, status, meeting.id, pid);
    const updated = db.prepare('SELECT * FROM attendance WHERE meeting_id = ? AND participant_id = ?').get(meeting.id, pid);
    res.json({ record: updated, summary: summaryFor(meeting.id) });
  });

  // Set many records at once, e.g. "mark everyone present".
  // Body: { status: 'present', only_unrecorded: boolean }
  router.post('/:id/attendance/bulk', (req, res) => {
    const meeting = loadOr404(req.params.id);
    assertEditable(meeting);
    const { status, only_unrecorded } = req.body || {};
    if (status !== null && !ATTENDANCE_STATUSES.includes(status)) throw new HttpError(400, 'Invalid attendance status.');
    const info = db.prepare(`
      UPDATE attendance SET status = ?, recorded_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END
      WHERE meeting_id = ? ${only_unrecorded ? 'AND status IS NULL' : ''}
    `).run(status, status, meeting.id);
    res.json({ updated: info.changes, summary: summaryFor(meeting.id) });
  });

  return router;
};
