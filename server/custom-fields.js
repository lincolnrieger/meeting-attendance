/**
 * Custom fields: extra details recorded for each person (e.g. membership number,
 * emergency contact, screening expiry). The administrator defines the fields;
 * every person stores their values as a JSON object keyed by field id in
 * participants.custom_values. Values are always stored as strings:
 *   text / long_text  free text
 *   number            a decimal number, e.g. "42" or "3.5"
 *   date              YYYY-MM-DD
 *   yes_no            "yes" or "no"
 * An empty value is simply left out of the object.
 */
const { ValidationError, isValidDate } = require('./validation');

const FIELD_TYPES = ['text', 'long_text', 'number', 'date', 'yes_no'];
const MAX_FIELDS = 100;

const clean = (v) => (v == null ? '' : String(v).trim());

async function listFields(db) {
  return db.all('SELECT id, label, type, sort_order FROM custom_fields ORDER BY sort_order, id');
}

/** Validate a field definition ({ label, type }). `others` are the existing fields, for the duplicate check. */
function validateFieldDef(input, others = []) {
  const errors = {};
  const label = clean(input.label).replace(/\s+/g, ' ');
  const type = clean(input.type) || 'text';
  if (!label) errors.label = 'Field name is required.';
  else if (label.length > 60) errors.label = 'Field name is too long (60 characters max).';
  else if (others.some((f) => f.label.toLowerCase() === label.toLowerCase())) errors.label = 'A field with this name already exists.';
  if (!FIELD_TYPES.includes(type)) errors.type = 'Invalid field type.';
  return { value: { label, type }, errors };
}

const YES = ['yes', 'y', 'true', '1', 'x', '✓', '✔'];
const NO = ['no', 'n', 'false', '0'];

/** Normalise and check one value for a field. Returns { value } or { error }. */
function checkValue(field, raw) {
  let v = clean(raw);
  if (!v) return { value: '' };
  switch (field.type) {
    case 'number':
      v = v.replace(/,/g, '');
      if (!/^-?\d+(\.\d+)?$/.test(v)) return { error: `${field.label} must be a number.` };
      return { value: v };
    case 'date':
      if (!isValidDate(v)) return { error: `${field.label} must be a valid date.` };
      return { value: v };
    case 'yes_no':
      if (YES.includes(v.toLowerCase())) return { value: 'yes' };
      if (NO.includes(v.toLowerCase())) return { value: 'no' };
      return { error: `${field.label} must be Yes or No.` };
    case 'long_text':
      if (v.length > 4000) return { error: `${field.label} is too long (4000 characters max).` };
      return { value: v };
    default:
      v = v.replace(/\s*\n\s*/g, ' ');
      if (v.length > 500) return { error: `${field.label} is too long (500 characters max).` };
      return { value: v };
  }
}

/**
 * Validate a person's custom values against the field definitions. Unknown
 * keys are ignored. Errors are keyed `custom_<id>` so forms can show them
 * next to the field.
 */
function validateCustomValues(fields, input) {
  const value = {};
  const errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const f of fields) {
    const r = checkValue(f, src[f.id]);
    if (r.error) errors[`custom_${f.id}`] = r.error;
    else if (r.value) value[f.id] = r.value;
  }
  return { value, errors };
}

/** Replace the stored JSON column with a parsed `custom` object. */
function hydrate(row) {
  if (!row) return row;
  const { custom_values, ...rest } = row;
  let custom = {};
  try {
    custom = JSON.parse(custom_values || '{}') || {};
  } catch {
    /* corrupt value: treat as empty */
  }
  return { ...rest, custom };
}

function assertFieldValid(errors) {
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

module.exports = { FIELD_TYPES, MAX_FIELDS, listFields, validateFieldDef, validateCustomValues, checkValue, hydrate, assertFieldValid };
