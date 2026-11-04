/**
 * Organisation settings: name, terminology, and the suggestion lists offered in
 * forms (roles, locations, session titles). Stored as JSON values in the
 * `app_settings` table; anything not saved falls back to DEFAULTS.
 */
const { ValidationError } = require('./validation');

const DEFAULTS = {
  organisation_name: 'Attendance Register',
  participant_singular: 'Participant',
  participant_plural: 'Participants',
  event_singular: 'Meeting',
  event_plural: 'Meetings',
  role_suggestions: ['Leader', 'Assistant Leader', 'Coordinator', 'Secretary', 'Treasurer', 'Member', 'Volunteer', 'Guest'],
  location_suggestions: ['Main Hall', 'Meeting Room 1', 'Meeting Room 2', 'Online (video call)'],
  title_suggestions: ['General Meeting', 'Committee Meeting', 'Workshop', 'Training Session', 'Annual General Meeting'],
};

const TEXT_KEYS = ['organisation_name', 'participant_singular', 'participant_plural', 'event_singular', 'event_plural'];
const LIST_KEYS = ['role_suggestions', 'location_suggestions', 'title_suggestions'];

async function getSettings(db) {
  const rows = await db.all('SELECT key, value FROM app_settings');
  const out = { ...DEFAULTS };
  for (const { key, value } of rows) {
    if (!(key in DEFAULTS)) continue;
    try {
      out[key] = JSON.parse(value);
    } catch {
      /* ignore corrupt value, keep default */
    }
  }
  return out;
}

function validateSettings(input) {
  const errors = {};
  const value = {};
  for (const k of TEXT_KEYS) {
    if (input[k] === undefined) continue;
    const v = String(input[k] ?? '').trim().replace(/\s+/g, ' ');
    if (!v) errors[k] = 'This field is required.';
    else if (v.length > (k === 'organisation_name' ? 80 : 30)) errors[k] = 'This is too long.';
    else value[k] = v;
  }
  for (const k of LIST_KEYS) {
    if (input[k] === undefined) continue;
    if (!Array.isArray(input[k])) {
      errors[k] = 'Invalid list.';
      continue;
    }
    const seen = new Set();
    const list = [];
    for (const item of input[k]) {
      const v = String(item ?? '').trim().replace(/\s+/g, ' ');
      if (!v || seen.has(v.toLowerCase())) continue;
      if (v.length > 120) { errors[k] = `"${v.slice(0, 30)}…" is too long (120 characters max).`; break; }
      seen.add(v.toLowerCase());
      list.push(v);
    }
    if (list.length > 200) errors[k] = 'Lists are limited to 200 suggestions.';
    value[k] = list;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return value;
}

async function saveSettings(db, input) {
  const value = validateSettings(input);
  const keys = Object.keys(value);
  if (keys.length) {
    await db.batch(keys.map((k) => [
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [k, JSON.stringify(value[k])],
    ]));
  }
  return getSettings(db);
}

module.exports = { DEFAULTS, getSettings, saveSettings };
