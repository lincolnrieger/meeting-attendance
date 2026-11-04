/**
 * Spreadsheet / CSV import helpers: find the heading row, guess what each
 * column is, and turn mapped rows into the payload for POST /participants/import.
 *
 * A grid is rows of cells: { text, kind: 'text'|'number'|'date'|'bool', formula }.
 */
import { parseCSV } from './csv';
import { readWorkbook } from './xlsx';

/** The standard fields a column can be imported into. */
export const STANDARD_TARGETS = [
  { value: 'full_name', label: 'Full name (split into first + last)' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'position', label: 'Role' },
  { value: 'date_of_birth', label: 'Date of birth' },
  { value: 'date_joined', label: 'Date joined' },
  { value: 'status', label: 'Status (active / inactive)' },
  { value: 'notes', label: 'Notes' },
];

/** Read a chosen file into [{ name, rows }] sheets (a CSV is one sheet). */
export async function readImportFile(file) {
  if (/\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return readWorkbook(await file.arrayBuffer());
  }
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files are not supported. Open it in Excel and save as .xlsx or CSV, then import again.');
  const rows = parseCSV(await file.text()).map((r) => r.map((text) => ({ text: text.trim(), kind: 'text', formula: false })));
  return [{ name: file.name.replace(/\.[^.]+$/, ''), rows }];
}

const filled = (cell) => cell && cell.text !== '';
const isInput = (cell) => filled(cell) && !cell.formula;

/** Index of the row that most likely holds the column headings. */
export function detectHeaderRow(rows) {
  const scan = rows.slice(0, 30);
  const counts = scan.map((r) => r.filter((c) => isInput(c) && c.kind === 'text').length);
  const max = Math.max(0, ...counts);
  const need = Math.max(2, Math.ceil(max * 0.6));
  const i = counts.findIndex((n) => n >= need);
  return i === -1 ? 0 : i;
}

/**
 * Rows below the heading row that hold real data: at least two typed-in
 * (non-formula) values, so blank template rows that only contain formulas or
 * a placeholder like "(add profile tab)" are ignored. Single-column files
 * need just one value.
 */
export function dataRowsOf(rows, headerRow) {
  const width = (rows[headerRow] || []).filter(filled).length;
  const need = width > 1 ? 2 : 1;
  const out = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    if ((rows[r] || []).filter(isInput).length >= need) out.push({ line: r + 1, cells: rows[r] });
  }
  return out;
}

/** How much real data a sheet has (used to pick the most likely sheet). */
export function sheetScore(sheet) {
  const h = detectHeaderRow(sheet.rows);
  return dataRowsOf(sheet.rows, h).reduce((n, r) => n + r.cells.filter(isInput).length, 0) * (sheet.hidden ? 0.1 : 1);
}

export const cleanHeading = (h) => String(h || '').replace(/\s+/g, ' ').trim();
const norm = (h) => cleanHeading(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const HEADING_GUESSES = [
  ['full_name', ['name', 'full name', 'member name', 'person', 'participant', 'member', 'student name', 'player name']],
  ['first_name', ['first name', 'given name', 'firstname', 'first', 'given names', 'preferred name']],
  ['last_name', ['last name', 'surname', 'family name', 'lastname', 'last']],
  ['email', ['email', 'email address', 'e mail', 'e mail address']],
  ['phone', ['phone', 'mobile', 'phone number', 'mobile number', 'contact number', 'mobile phone', 'cell']],
  ['position', ['role', 'position', 'role in team', 'job title', 'role position']],
  ['date_of_birth', ['date of birth', 'dob', 'birthday', 'birth date', 'birthdate', 'd o b']],
  ['date_joined', ['date joined', 'joined', 'start date', 'start of service', 'join date', 'member since', 'date started', 'commenced']],
  ['notes', ['notes', 'note', 'comments', 'comment']],
  ['status', ['status', 'active', 'membership status']],
];

const DATE_TEXT = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$|^\d{4}-\d{2}-\d{2}$/;
const YES_NO = /^(yes|no|y|n|true|false)$/i;

/** Guess a custom field type from a column's cells. */
export function guessType(cells, heading = '') {
  const vals = cells.filter(filled);
  if (!vals.length) return 'text';
  if (vals.every((c) => c.kind === 'date' || DATE_TEXT.test(c.text))) return 'date';
  if (vals.every((c) => c.kind === 'bool' || YES_NO.test(c.text))) return 'yes_no';
  if (vals.every((c) => c.kind === 'number') && !/\b(no|number|num|id|phone|mobile|code|postcode|zip|srn)\b/i.test(heading)) return 'number';
  if (vals.some((c) => c.text.length > 120 || c.text.includes('\n'))) return 'long_text';
  return 'text';
}

/**
 * Build the initial mapping for each column:
 *   { index, heading, sample, calculated, target, label, type }
 * target is '' (skip), a standard field, 'field:<id>' or 'new'.
 */
export function guessColumns(rows, headerRow, fields) {
  const header = rows[headerRow] || [];
  const data = dataRowsOf(rows, headerRow);
  const width = Math.max(header.length, ...data.map((r) => r.cells.length), 0);
  const used = new Set();
  const cols = [];
  for (let i = 0; i < width; i++) {
    const heading = cleanHeading(header[i]?.text);
    const cells = data.map((r) => r.cells[i]);
    const nonEmpty = cells.filter(filled);
    if (!heading && !nonEmpty.length) continue;
    const present = cells.filter(Boolean);
    const calculated = present.length > 0 && present.every((c) => c.formula);
    const sample = nonEmpty[0]?.text || '';
    const type = guessType(cells, heading);
    const n = norm(heading);
    let target = 'new';
    const existing = fields.find((f) => norm(f.label) === n);
    const std = HEADING_GUESSES.find(([, names]) => names.includes(n))?.[0];
    if (calculated) target = '';
    else if (!heading) target = '';
    else if (existing) target = `field:${existing.id}`;
    else if (std && !used.has(std)) {
      const okStatus = std !== 'status' || nonEmpty.every((c) => /^(active|inactive)$/i.test(c.text));
      if (okStatus) target = std;
    }
    if (STANDARD_TARGETS.some((t) => t.value === target)) used.add(target);
    if (target === 'full_name') { used.add('first_name'); used.add('last_name'); }
    if (target === 'first_name' || target === 'last_name') used.add('full_name');
    cols.push({ index: i, heading: heading || `Column ${i + 1}`, sample, calculated, target, label: heading || `Column ${i + 1}`, type });
  }
  return cols;
}

/** Convert DD/MM/YYYY (Australian order) and similar to YYYY-MM-DD; leave anything else unchanged. */
export function toISODate(cell) {
  if (!filled(cell)) return '';
  if (cell.kind === 'date') return cell.text;
  const t = cell.text;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return t;
  const y = m[3].length === 2 ? (Number(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`) : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function splitName(full) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_name: parts[0] || '', last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

/**
 * Turn mapped data rows into the import payload.
 * defaults: { position, date_joined } used when a row has no value.
 */
export function buildPayload(rows, headerRow, columns, fields, defaults) {
  const active = columns.filter((c) => c.target);
  const newFields = active.filter((c) => c.target === 'new').map((c) => ({ key: `new:${c.index}`, label: cleanHeading(c.label) || c.heading, type: c.type }));
  const typeOf = (target) => {
    if (target === 'new') return null;
    if (target.startsWith('field:')) return fields.find((f) => `field:${f.id}` === target)?.type;
    return null;
  };
  const out = dataRowsOf(rows, headerRow).map(({ line, cells }) => {
    const row = { line, custom: {} };
    for (const c of active) {
      const cell = cells[c.index];
      const text = filled(cell) ? cell.text : '';
      if (c.target === 'full_name') Object.assign(row, splitName(text));
      else if (c.target === 'date_of_birth' || c.target === 'date_joined') row[c.target] = toISODate(cell);
      else if (c.target === 'status') row.status = text ? text.toLowerCase() : 'active';
      else if (c.target === 'new' || c.target.startsWith('field:')) {
        const key = c.target === 'new' ? `new:${c.index}` : c.target.slice(6);
        const type = c.target === 'new' ? c.type : typeOf(c.target);
        row.custom[key] = type === 'date' ? toISODate(cell) : text;
      } else row[c.target] = text;
    }
    if (!row.position) row.position = defaults.position;
    if (!row.date_joined) row.date_joined = defaults.date_joined;
    return row;
  });
  return { rows: out, new_fields: newFields };
}
