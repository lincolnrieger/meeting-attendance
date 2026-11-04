/**
 * Import people from an Excel workbook (.xlsx) or CSV file.
 * 1. choose a file (and sheet / heading row for workbooks)
 * 2. decide what each column becomes: a standard field, an existing custom
 *    field, a new custom field, or skipped
 * 3. import, then show what was skipped and why
 */
import { useMemo, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { api } from '../lib/api';
import { useAppSettings } from '../lib/settings';
import { downloadCSV } from '../lib/csv';
import { todayISO } from '../lib/format';
import { FIELD_TYPES } from '../lib/customFields';
import { STANDARD_TARGETS, buildPayload, dataRowsOf, detectHeaderRow, guessColumns, readImportFile, sheetScore } from '../lib/importer';
import { ErrorNotice } from './ui';
import { Modal, useToast } from './Feedback';

export const TEMPLATE_COLUMNS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'position', label: 'Role' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'date_joined', label: 'Date joined' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
];

export default function ImportDialog({ onClose, onDone }) {
  const { t, settings, fields, reloadFields } = useAppSettings();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState([]);
  const [defaults, setDefaults] = useState({ position: settings.role_suggestions.includes('Member') ? 'Member' : settings.role_suggestions[0] || 'Member', date_joined: todayISO() });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const rows = sheets?.[sheetIndex]?.rows || [];
  const dataRows = useMemo(() => dataRowsOf(rows, headerRow), [rows, headerRow]);

  function setup(sheetList, index, header) {
    const r = sheetList[index].rows;
    const h = header ?? detectHeaderRow(r);
    setSheetIndex(index);
    setHeaderRow(h);
    setColumns(guessColumns(r, h, fields));
  }

  async function pick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    setResult(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const list = await readImportFile(file);
      const best = list.reduce((b, s, i) => (sheetScore(s) > sheetScore(list[b]) ? i : b), 0);
      if (!list[best].rows.length) throw new Error('The file is empty.');
      setSheets(list);
      setup(list, best);
    } catch (err) {
      setSheets(null);
      setError(err);
    }
  }

  const setCol = (i, patch) => setColumns((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const targets = new Set(columns.map((c) => c.target));
  const hasName = targets.has('full_name') || (targets.has('first_name') && targets.has('last_name'));
  const problems = [];
  if (!hasName) problems.push('Choose the column(s) holding names — either "Full name", or both "First name" and "Last name".');
  if (!targets.has('email')) problems.push('Choose the column holding email addresses (needed to tell people apart).');
  const dupes = STANDARD_TARGETS.filter((s) => columns.filter((c) => c.target === s.value).length > 1).map((s) => s.label);
  if (dupes.length) problems.push(`Only one column can go into: ${dupes.join(', ')}.`);
  const newCount = columns.filter((c) => c.target === 'new').length;

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload(rows, headerRow, columns, fields, defaults);
      const r = await api.post('/participants/import', payload);
      setResult(r);
      if (r.created) {
        if (r.fields_created) await reloadFields();
        toast(`Imported ${r.created} ${r.created === 1 ? t.participant : t.participants}.`);
        onDone();
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function template() {
    downloadCSV('import-template.csv', [
      { first_name: 'Alex', last_name: 'Citizen', email: 'alex.citizen@example.com', phone: '0400 000 000', position: 'Member', date_of_birth: '1980-05-17', date_joined: todayISO(), status: 'active', notes: '' },
    ], TEMPLATE_COLUMNS);
  }

  const headerOptions = rows.slice(0, 30).map((r, i) => ({ i, preview: r.filter((c) => c && c.text).slice(0, 4).map((c) => c.text).join(' · ') })).filter((o) => o.preview);

  return (
    <Modal title={`Import ${t.participants}`} onClose={onClose} size="lg">
      <div className="modal-body stack">
        {!result && (
          <>
            <p className="muted">
              Import from an <strong>Excel workbook (.xlsx)</strong> or a <strong>CSV</strong> file. Choose what each column becomes — any column that
              isn’t a standard field can become a <strong>custom field</strong>, so nothing in your spreadsheet has to be lost.
              People whose email already exists are skipped.
            </p>
            <div className="row gap">
              <button type="button" className="btn" onClick={() => fileRef.current.click()}><FileUp size={16} /> {sheets ? 'Choose another file…' : 'Choose file…'}</button>
              <span className="muted small">{fileName || 'No file selected'}</span>
              <button type="button" className="link ml-auto" onClick={template}>Download a blank template</button>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={pick} />
          </>
        )}
        <ErrorNotice error={error} />

        {sheets && !result && (
          <>
            <div className="import-source">
              {sheets.length > 1 && (
                <div className="field">
                  <label htmlFor="import-sheet">Sheet</label>
                  <select id="import-sheet" className="input" value={sheetIndex} onChange={(e) => setup(sheets, Number(e.target.value))}>
                    {sheets.map((s, i) => <option key={i} value={i}>{s.name}{s.hidden ? ' (hidden)' : ''}</option>)}
                  </select>
                </div>
              )}
              <div className="field grow">
                <label htmlFor="import-header">Column headings are in</label>
                <select id="import-header" className="input" value={headerRow} onChange={(e) => setup(sheets, sheetIndex, Number(e.target.value))}>
                  {headerOptions.map((o) => <option key={o.i} value={o.i}>Row {o.i + 1}: {o.preview.slice(0, 70)}</option>)}
                </select>
              </div>
            </div>
            <p className="small"><strong>{dataRows.length}</strong> row{dataRows.length === 1 ? '' : 's'} found. Choose what each column becomes:</p>

            <div className="table-wrap bordered import-map">
              <table className="table table-compact">
                <thead><tr><th>Column</th><th className="hide-sm">Example</th><th>Import as</th></tr></thead>
                <tbody>
                  {columns.map((c, i) => (
                    <tr key={c.index} className={c.target ? '' : 'row-inactive'}>
                      <td>
                        <span className="import-heading">{c.heading}</span>
                        {c.calculated && <span className="muted small block">Calculated in the spreadsheet</span>}
                      </td>
                      <td className="hide-sm muted import-sample">{c.sample || '—'}</td>
                      <td>
                        <select className="input" aria-label={`Import ${c.heading} as`} value={c.target} onChange={(e) => setCol(i, { target: e.target.value })}>
                          <option value="">Don’t import</option>
                          <option value="new">New custom field</option>
                          <optgroup label="Standard fields">
                            {STANDARD_TARGETS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </optgroup>
                          {fields.length > 0 && (
                            <optgroup label="Existing custom fields">
                              {fields.map((f) => <option key={f.id} value={`field:${f.id}`}>{f.label}</option>)}
                            </optgroup>
                          )}
                        </select>
                        {c.target === 'new' && (
                          <div className="import-new">
                            <input className="input" aria-label={`Name for the new field from ${c.heading}`} value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} />
                            <select className="input" aria-label={`Type for the new field from ${c.heading}`} value={c.type} onChange={(e) => setCol(i, { type: e.target.value })}>
                              {FIELD_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="import-role">Role when a row has none</label>
                <input id="import-role" className="input" list="import-role-list" value={defaults.position} onChange={(e) => setDefaults((d) => ({ ...d, position: e.target.value }))} />
                <datalist id="import-role-list">{settings.role_suggestions.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
              <div className="field">
                <label htmlFor="import-joined">Date joined when a row has none</label>
                <input id="import-joined" type="date" className="input" value={defaults.date_joined} onChange={(e) => setDefaults((d) => ({ ...d, date_joined: e.target.value }))} />
              </div>
            </div>

            {problems.length > 0 && <div className="notice notice-error"><span>{problems.map((p) => <span key={p} className="block">{p}</span>)}</span></div>}
          </>
        )}

        {result && (
          <div className="stack">
            <div className="notice notice-success">
              Imported {result.created} {result.created === 1 ? t.participant : t.participants}. {result.skipped.length} row{result.skipped.length === 1 ? '' : 's'} skipped.
              {result.fields_created > 0 && ` ${result.fields_created} custom field${result.fields_created === 1 ? '' : 's'} created.`}
            </div>
            {result.skipped.length > 0 && (
              <div className="table-wrap bordered">
                <table className="table table-compact">
                  <thead><tr><th>Row</th><th>Name</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.skipped.map((s) => (
                      <tr key={s.line}><td>{s.line}</td><td>{s.name || '—'}</td><td>{s.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="modal-footer">
        {sheets && !result && newCount > 0 && <span className="muted small mr-auto">{newCount} new custom field{newCount === 1 ? '' : 's'} will be created</span>}
        <button type="button" className="btn" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
        {!result && (
          <button type="button" className="btn btn-primary" disabled={!sheets || !dataRows.length || problems.length > 0 || busy} onClick={runImport}>
            {busy ? 'Importing…' : `Import ${sheets ? dataRows.length : ''} ${dataRows.length === 1 ? t.participant : t.participants}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
