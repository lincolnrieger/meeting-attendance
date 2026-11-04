/**
 * Shared SQL fragments and helpers for attendance statistics.
 *
 * Definitions used throughout the application:
 *  - A meeting is "held" when it is marked Completed, or it is still marked
 *    Upcoming but its date has already passed. Cancelled meetings never count.
 *  - "Attended" = Present, Late, Left early or Online.
 *  - Attendance rate = attended ÷ recorded records (records whose status has
 *    been entered). Unrecorded entries are reported separately so they don't
 *    distort the percentage.
 */
const { today } = require('./validation');

/** SQL condition (uses alias `m`) for a meeting that has been held. Bind `today` once. */
const HELD_SQL = `(m.status = 'completed' OR (m.status = 'upcoming' AND m.date < @today))`;
const UPCOMING_SQL = `(m.status = 'upcoming' AND m.date >= @today)`;

/** Aggregate columns over the `attendance` table aliased `a`. */
const AGG_SQL = `
  COUNT(a.participant_id)                                         AS invited,
  COALESCE(SUM(a.status IS NOT NULL), 0)                          AS recorded,
  COALESCE(SUM(a.status IN ('present','late','left_early','online')), 0) AS attended,
  COALESCE(SUM(a.status = 'present'), 0)                          AS present,
  COALESCE(SUM(a.status = 'late'), 0)                             AS late,
  COALESCE(SUM(a.status = 'left_early'), 0)                       AS left_early,
  COALESCE(SUM(a.status = 'online'), 0)                           AS online,
  COALESCE(SUM(a.status = 'apology'), 0)                          AS apology,
  COALESCE(SUM(a.status = 'absent'), 0)                           AS absent,
  COALESCE(SUM(a.status IS NULL), 0)                              AS unrecorded
`;

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

/** Adds `rate` (attendance %) to an aggregate row. */
function withRate(row) {
  return { ...row, rate: pct(row.attended, row.recorded) };
}

const params = (extra = {}) => ({ today: today(), ...extra });

module.exports = { HELD_SQL, UPCOMING_SQL, AGG_SQL, withRate, pct, params };
