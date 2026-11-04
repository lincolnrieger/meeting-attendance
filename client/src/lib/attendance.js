/** Attendance statuses — keep in sync with server/validation.js. */
export const STATUSES = [
  { value: 'present', label: 'Present', short: 'Present', attended: true },
  { value: 'late', label: 'Late', short: 'Late', attended: true },
  { value: 'left_early', label: 'Left early', short: 'Left early', attended: true },
  { value: 'online', label: 'Online', short: 'Online', attended: true },
  { value: 'apology', label: 'Apology received', short: 'Apology', attended: false },
  { value: 'absent', label: 'Absent', short: 'Absent', attended: false },
];

export const STATUS_BY_VALUE = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

export function statusLabel(value) {
  return value ? STATUS_BY_VALUE[value]?.label || value : 'Not recorded';
}

export const MEETING_STATUS_LABEL = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };

export function formatRate(rate) {
  return rate == null ? '—' : `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}
