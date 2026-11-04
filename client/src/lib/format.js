/** Date/time formatting (Australian conventions). Dates are stored as YYYY-MM-DD. */

const parse = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function formatDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parse(iso);
  return d ? d.toLocaleDateString('en-AU', opts) : '—';
}

export function formatDateLong(iso) {
  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatWeekday(iso) {
  return formatDate(iso, { weekday: 'short' });
}

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftISO(iso, { months = 0, days = 0 }) {
  const d = parse(iso);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from today until the given date (negative if in the past). */
export function daysUntil(iso) {
  const t = parse(todayISO());
  return Math.round((parse(iso) - t) / 86400000);
}

export function relativeDay(iso) {
  const n = daysUntil(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1) return `In ${n} days`;
  if (n === -1) return 'Yesterday';
  return `${-n} days ago`;
}

export function age(dob) {
  const d = parse(dob);
  if (!d) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

export const fullName = (p) => `${p.first_name} ${p.last_name}`;
