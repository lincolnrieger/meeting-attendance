/**
 * Request validation helpers and shared domain constants.
 *
 * Validators return `{ value, errors }`. `errors` maps field names to
 * human-readable messages and is sent back to the client (HTTP 422) so the
 * form can show the message next to the relevant field.
 */

const ATTENDANCE_STATUSES = ['present', 'late', 'left_early', 'online', 'apology', 'absent'];
/** Statuses that count as having attended the meeting. */
const ATTENDED_STATUSES = ['present', 'late', 'left_early', 'online'];
const MEETING_STATUSES = ['upcoming', 'completed', 'cancelled'];
const PARTICIPANT_STATUSES = ['active', 'inactive'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_RE = /^[+()\d\s-]{6,20}$/;

class ValidationError extends Error {
  constructor(errors, message = 'Please correct the highlighted fields.') {
    super(message);
    this.status = 422;
    this.errors = errors;
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Time zone used to decide what "today" is (and therefore which meetings are
 * past or upcoming). Cloudflare Workers run in UTC, so this matters.
 * Configured with the APP_TIMEZONE variable; defaults to Australia/Melbourne.
 */
let timeZone = 'Australia/Melbourne';
function setTimeZone(tz) {
  if (!tz) return;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    timeZone = tz;
  } catch {
    console.warn(`[config] Unknown APP_TIMEZONE "${tz}", using ${timeZone}.`);
  }
}

/** Today's date (YYYY-MM-DD) in the configured time zone. */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function validateParticipant(input) {
  const errors = {};
  const value = {
    first_name: str(input.first_name),
    last_name: str(input.last_name),
    date_of_birth: str(input.date_of_birth) || null,
    email: str(input.email).toLowerCase(),
    phone: str(input.phone) || null,
    position: str(input.position),
    date_joined: str(input.date_joined),
    status: str(input.status) || 'active',
    notes: str(input.notes) || null,
    photo: input.photo ? String(input.photo) : null,
  };

  if (!value.first_name) errors.first_name = 'First name is required.';
  else if (value.first_name.length > 80) errors.first_name = 'First name is too long.';
  if (!value.last_name) errors.last_name = 'Last name is required.';
  else if (value.last_name.length > 80) errors.last_name = 'Last name is too long.';

  if (!value.email) errors.email = 'Email address is required.';
  else if (!EMAIL_RE.test(value.email) || value.email.length > 160) errors.email = 'Enter a valid email address.';

  if (value.phone && !PHONE_RE.test(value.phone)) errors.phone = 'Enter a valid phone number (digits, spaces, +, - and brackets only).';

  if (!value.position) errors.position = 'Role is required.';
  else if (value.position.length > 120) errors.position = 'Role is too long.';

  if (value.date_of_birth) {
    if (!isValidDate(value.date_of_birth)) errors.date_of_birth = 'Enter a valid date.';
    else if (value.date_of_birth >= today()) errors.date_of_birth = 'Date of birth must be in the past.';
    else if (value.date_of_birth < '1900-01-01') errors.date_of_birth = 'Date of birth is too far in the past.';
  }

  if (!value.date_joined) errors.date_joined = 'Date joined is required.';
  else if (!isValidDate(value.date_joined)) errors.date_joined = 'Enter a valid date.';
  else if (value.date_of_birth && isValidDate(value.date_of_birth) && value.date_joined <= value.date_of_birth)
    errors.date_joined = 'Date joined must be after date of birth.';

  if (!PARTICIPANT_STATUSES.includes(value.status)) errors.status = 'Status must be active or inactive.';

  if (value.notes && value.notes.length > 4000) errors.notes = 'Notes are limited to 4000 characters.';

  if (value.photo) {
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(value.photo)) errors.photo = 'Photo must be a PNG, JPEG, WebP or GIF image.';
    else if (value.photo.length > 400_000) errors.photo = 'Photo is too large.';
  }

  return { value, errors };
}

function validateMeeting(input) {
  const errors = {};
  const value = {
    title: str(input.title),
    date: str(input.date),
    start_time: str(input.start_time),
    end_time: str(input.end_time),
    location: str(input.location),
    description: str(input.description) || null,
    status: str(input.status) || 'upcoming',
  };

  if (!value.title) errors.title = 'Title is required.';
  else if (value.title.length > 160) errors.title = 'Title is too long.';
  if (!value.date) errors.date = 'Date is required.';
  else if (!isValidDate(value.date)) errors.date = 'Enter a valid date.';
  if (!TIME_RE.test(value.start_time)) errors.start_time = 'Enter a valid start time.';
  if (!TIME_RE.test(value.end_time)) errors.end_time = 'Enter a valid finish time.';
  else if (!errors.start_time && value.end_time <= value.start_time) errors.end_time = 'Finish time must be after the start time.';
  if (!value.location) errors.location = 'Location is required.';
  else if (value.location.length > 160) errors.location = 'Location is too long.';
  if (value.description && value.description.length > 10000) errors.description = 'Agenda is limited to 10,000 characters.';
  if (!MEETING_STATUSES.includes(value.status)) errors.status = 'Invalid meeting status.';

  let participantIds = null;
  if (input.participant_ids !== undefined) {
    if (!Array.isArray(input.participant_ids)) errors.participant_ids = 'Invalid participant list.';
    else {
      participantIds = [...new Set(input.participant_ids.map(Number))];
      if (participantIds.some((n) => !Number.isInteger(n) || n <= 0)) errors.participant_ids = 'Invalid participant list.';
    }
  }

  return { value, participantIds, errors };
}

function assertValid(errors) {
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

module.exports = {
  ATTENDANCE_STATUSES,
  ATTENDED_STATUSES,
  MEETING_STATUSES,
  PARTICIPANT_STATUSES,
  ValidationError,
  HttpError,
  validateParticipant,
  validateMeeting,
  assertValid,
  isValidDate,
  today,
  setTimeZone,
};
