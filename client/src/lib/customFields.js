/** Custom field types and value formatting (mirrors server/custom-fields.js). */
import { formatDate } from './format';

export const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'yes_no', label: 'Yes / No' },
];
export const FIELD_TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

/** Human-readable value for display. */
export function formatFieldValue(field, value) {
  if (value == null || value === '') return '';
  if (field.type === 'date') return formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' });
  if (field.type === 'yes_no') return value === 'yes' ? 'Yes' : 'No';
  return String(value);
}

/** Value for CSV export (dates stay YYYY-MM-DD so the file can be re-imported). */
export function exportFieldValue(field, value) {
  if (value == null || value === '') return '';
  if (field.type === 'yes_no') return value === 'yes' ? 'Yes' : 'No';
  return String(value);
}
