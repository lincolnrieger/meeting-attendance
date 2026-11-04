/**
 * /api/reports — attendance statistics for a date range.
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional, inclusive)
 */
const express = require('express');
const { isValidDate, HttpError } = require('../validation');
const { HELD_SQL, AGG_SQL, withRate, params } = require('../stats');

module.exports = function reportsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if ((from && !isValidDate(from)) || (to && !isValidDate(to))) throw new HttpError(400, 'Invalid date range.');
    if (from && to && from > to) throw new HttpError(400, 'The start date must be before the end date.');

    const p = params({ from: from || '0000-01-01', to: to || '9999-12-31' });
    const inRange = `${HELD_SQL} AND m.date BETWEEN @from AND @to`;

    const summary = withRate(db.prepare(`
      SELECT ${AGG_SQL}, COUNT(DISTINCT m.id) AS meetings
      FROM meetings m LEFT JOIN attendance a ON a.meeting_id = m.id
      WHERE ${inRange}
    `).get(p));
    summary.cancelled = db.prepare(`
      SELECT COUNT(*) FROM meetings m WHERE m.status = 'cancelled' AND m.date BETWEEN @from AND @to
    `).pluck().get(p);

    const byMember = db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.email, p.position, p.status AS participant_status, ${AGG_SQL}
      FROM participants p
      JOIN attendance a ON a.participant_id = p.id
      JOIN meetings m ON m.id = a.meeting_id
      WHERE ${inRange}
      GROUP BY p.id
      ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE
    `).all(p).map(withRate);

    const byMeeting = db.prepare(`
      SELECT m.id, m.title, m.date, m.start_time, m.location, ${AGG_SQL}
      FROM meetings m LEFT JOIN attendance a ON a.meeting_id = m.id
      WHERE ${inRange}
      GROUP BY m.id
      ORDER BY m.date DESC, m.start_time DESC
    `).all(p).map(withRate);

    const trend = db.prepare(`
      SELECT substr(m.date, 1, 7) AS month, COUNT(DISTINCT m.id) AS meetings, ${AGG_SQL}
      FROM meetings m LEFT JOIN attendance a ON a.meeting_id = m.id
      WHERE ${inRange}
      GROUP BY month ORDER BY month
    `).all(p).map(withRate);

    res.json({ range: { from: from || null, to: to || null }, summary, byMember, byMeeting, trend });
  });

  return router;
};
