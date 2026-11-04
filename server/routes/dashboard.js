/**
 * /api/dashboard — summary figures for the overview page.
 */
const express = require('express');
const { HELD_SQL, UPCOMING_SQL, AGG_SQL, withRate, params } = require('../stats');

module.exports = function dashboardRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const p = params();

    const participants = db.prepare(`
      SELECT COUNT(*) AS total, COALESCE(SUM(status = 'active'), 0) AS active FROM participants
    `).get();

    const meetingCounts = db.prepare(`
      SELECT COALESCE(SUM(${HELD_SQL}), 0) AS held, COALESCE(SUM(${UPCOMING_SQL}), 0) AS upcoming
      FROM meetings m
    `).get(p);

    const overall = withRate(db.prepare(`
      SELECT ${AGG_SQL} FROM attendance a JOIN meetings m ON m.id = a.meeting_id WHERE ${HELD_SQL}
    `).get(p));

    const upcoming = db.prepare(`
      SELECT m.id, m.title, m.date, m.start_time, m.end_time, m.location,
             COUNT(a.participant_id) AS invited,
             COALESCE(SUM(a.status = 'apology'), 0) AS apologies
      FROM meetings m LEFT JOIN attendance a ON a.meeting_id = m.id
      WHERE ${UPCOMING_SQL}
      GROUP BY m.id ORDER BY m.date, m.start_time LIMIT 6
    `).all(p);

    const latestMeeting = db.prepare(`
      SELECT m.id, m.title, m.date, m.start_time, m.location FROM meetings m
      WHERE ${HELD_SQL} ORDER BY m.date DESC, m.start_time DESC LIMIT 1
    `).get(p);
    let latest = null;
    if (latestMeeting) {
      latest = {
        meeting: latestMeeting,
        summary: withRate(db.prepare(`SELECT ${AGG_SQL} FROM attendance a WHERE a.meeting_id = ?`).get(latestMeeting.id)),
      };
    }

    // Highest attendance among active members with at least 3 recorded meetings.
    const topMembers = db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.photo, ${AGG_SQL}
      FROM participants p
      JOIN attendance a ON a.participant_id = p.id
      JOIN meetings m ON m.id = a.meeting_id
      WHERE p.status = 'active' AND ${HELD_SQL}
      GROUP BY p.id
      HAVING recorded >= 3
      ORDER BY (attended * 1.0 / recorded) DESC, attended DESC, p.last_name
      LIMIT 5
    `).all(p).map(withRate);

    // Held meetings that still have attendance entries not recorded.
    const outstandingMeetings = db.prepare(`
      SELECT m.id, m.title, m.date, COUNT(*) AS unrecorded,
             GROUP_CONCAT(p.first_name || ' ' || p.last_name, ', ') AS names
      FROM attendance a
      JOIN meetings m ON m.id = a.meeting_id
      JOIN participants p ON p.id = a.participant_id
      WHERE a.status IS NULL AND ${HELD_SQL}
      GROUP BY m.id ORDER BY m.date DESC
    `).all(p);

    const outstandingMembers = db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.photo, COUNT(*) AS unrecorded, MAX(m.date) AS latest_date
      FROM attendance a
      JOIN meetings m ON m.id = a.meeting_id
      JOIN participants p ON p.id = a.participant_id
      WHERE a.status IS NULL AND ${HELD_SQL}
      GROUP BY p.id ORDER BY unrecorded DESC, p.last_name
    `).all(p);

    res.json({
      participants,
      meetings: meetingCounts,
      overall,
      upcoming,
      latest,
      topMembers,
      outstandingMeetings,
      outstandingMembers,
    });
  });

  return router;
};
