import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileUp, Info, Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAppSettings } from '../lib/settings';
import { formatRate } from '../lib/attendance';
import { downloadCSV, parseCSVObjects } from '../lib/csv';
import { formatDate, fullName, todayISO } from '../lib/format';
import { EmptyState, ErrorNotice, Loading, PageHeader, PersonCell, RateBar } from '../components/ui';
import { Modal, useConfirm, useToast } from '../components/Feedback';

/** Columns used for both export and the import template, so files round-trip. */
const EXPORT_COLUMNS = [
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

export default function Participants() {
  const { data, error, loading, reload } = useApi('/participants');
  const { t } = useAppSettings();
  const [params, setParams] = useSearchParams();
  const [showImport, setShowImport] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  const search = params.get('q') || '';
  const status = params.get('status') || 'all';
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const all = data?.participants || [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (!q || fullName(p).toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.position.toLowerCase().includes(q)),
    );
  }, [all, search, status]);

  const counts = useMemo(() => ({
    all: all.length,
    active: all.filter((p) => p.status === 'active').length,
    inactive: all.filter((p) => p.status === 'inactive').length,
    sample: all.filter((p) => p.is_sample).length,
  }), [all]);

  async function remove(p) {
    const ok = await confirm({
      title: `Delete ${t.participant}`,
      message: (
        <>
          <p>Permanently delete <strong>{fullName(p)}</strong>? Their profile and all {p.invited} attendance record{p.invited === 1 ? '' : 's'} will be removed. This cannot be undone.</p>
          {p.status === 'active' && <p className="muted">To keep their history, consider editing the profile and setting the status to Inactive instead.</p>}
        </>
      ),
      confirmLabel: `Delete ${t.participant}`,
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/participants/${p.id}`);
      toast(`${fullName(p)} was deleted.`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function exportCSV() {
    downloadCSV(`${t.participants.replace(/\s+/g, '-')}-${todayISO()}.csv`, rows, [
      ...EXPORT_COLUMNS,
      { key: 'recorded', label: `${t.Events} recorded` },
      { key: 'attended', label: `${t.Events} attended` },
      { key: 'apology', label: 'Apologies' },
      { key: 'absent', label: 'Absences' },
      { value: (r) => (r.rate == null ? '' : r.rate), label: 'Attendance %' },
      { value: (r) => (r.is_sample ? 'Yes' : 'No'), label: 'Sample record' },
    ]);
  }

  return (
    <>
      <PageHeader
        title={t.Participants}
        subtitle={`Everyone whose attendance is recorded at your ${t.events}.`}
        actions={
          <>
            <button className="btn" onClick={() => setShowImport(true)}><FileUp size={16} /> Import CSV</button>
            <button className="btn" onClick={exportCSV} disabled={!rows.length}><Download size={16} /> Export</button>
            <Link to="/participants/new" className="btn btn-primary"><UserPlus size={16} /> Add {t.participant}</Link>
          </>
        }
      />

      {counts.sample > 0 && (
        <div className="notice notice-info">
          <Info size={16} />
          <span>
            {counts.sample} profile{counts.sample === 1 ? ' is' : 's are'} <strong>fictional sample data</strong> (marked <em>Sample</em>) for demonstration.
            Edit or delete them individually, or remove all sample data in <Link to="/settings">Settings</Link>.
          </span>
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input
            className="input"
            type="search"
            placeholder="Search by name, email or role"
            value={search}
            onChange={(e) => setParam('q', e.target.value)}
            aria-label={`Search ${t.participants}`}
          />
        </div>
        <div className="segmented" role="tablist" aria-label="Filter by status">
          {['all', 'active', 'inactive'].map((s) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'on' : ''} onClick={() => setParam('status', s)}>
              {s[0].toUpperCase() + s.slice(1)} <span className="count">{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>

      <ErrorNotice error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="panel">
          {rows.length === 0 ? (
            <EmptyState icon={Users} title={all.length ? `No ${t.participants} match your search` : `No ${t.participants} yet`}>
              {!all.length && <Link to="/participants/new" className="link">Add the first {t.participant}</Link>}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="hide-sm">Email</th>
                    <th className="hide-md">Phone</th>
                    <th className="hide-md">Joined</th>
                    <th className="rate-col">Attendance</th>
                    <th>Status</th>
                    <th className="actions-col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={`clickable ${p.status === 'inactive' ? 'row-inactive' : ''}`} onClick={(e) => !e.target.closest('a,button') && navigate(`/participants/${p.id}`)}>
                      <td><PersonCell p={p} sample={p.is_sample} /></td>
                      <td className="hide-sm"><a href={`mailto:${p.email}`} className="muted-link">{p.email}</a></td>
                      <td className="hide-md nowrap muted">{p.phone || '—'}</td>
                      <td className="hide-md nowrap muted">{formatDate(p.date_joined)}</td>
                      <td className="rate-col">
                        <span className="rate"><RateBar rate={p.rate} /> {formatRate(p.rate)}</span>
                      </td>
                      <td><span className={`badge badge-p-${p.status}`}>{p.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                      <td className="actions-col">
                        <Link to={`/participants/${p.id}/edit`} className="icon-btn" title="Edit" aria-label={`Edit ${fullName(p)}`}><Pencil size={15} /></Link>
                        <button className="icon-btn danger" title="Delete" aria-label={`Delete ${fullName(p)}`} onClick={() => remove(p)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 0 && <div className="table-foot">Showing {rows.length} of {all.length} {t.participants}</div>}
        </div>
      )}

      {showImport && <ImportDialog t={t} onClose={() => setShowImport(false)} onDone={reload} />}
    </>
  );
}

function ImportDialog({ t, onClose, onDone }) {
  const fileRef = useRef(null);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function pick(e) {
    const file = e.target.files[0];
    setResult(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parseCSVObjects(await file.text());
      if (!parsed.length) throw new Error('The file has no data rows.');
      if (!('email' in parsed[0]) || !('first_name' in parsed[0]) || !('last_name' in parsed[0])) {
        throw new Error('The file must include "First name", "Last name" and "Email" columns. Download the template for the expected format.');
      }
      // A "Role" column is stored as the position.
      for (const r of parsed) if (r.role && !r.position) r.position = r.role;
      // Accept Australian-style dates (DD/MM/YYYY) as well as YYYY-MM-DD.
      for (const r of parsed) {
        for (const k of ['date_of_birth', 'date_joined']) {
          const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(r[k] || '');
          if (m) r[k] = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        }
      }
      setRows(parsed);
    } catch (err) {
      setRows(null);
      setError(err);
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const r = await api.post('/participants/import', { rows });
      setResult(r);
      if (r.created) {
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
    downloadCSV('participant-import-template.csv', [
      { first_name: 'Alex', last_name: 'Citizen', email: 'alex.citizen@example.com', phone: '0400 000 000', position: 'Member', date_of_birth: '1980-05-17', date_joined: todayISO(), status: 'active', notes: '' },
    ], EXPORT_COLUMNS);
  }

  return (
    <Modal title={`Import ${t.participants} from CSV`} onClose={onClose}>
      <div className="modal-body stack">
        <p className="muted">
          The first row must contain column headings. Required: <strong>First name, Last name, Email, Role, Date joined</strong> (a column called Position also works for Role).
          Optional: Phone, Date of birth, Status (active/inactive), Notes. Dates may be YYYY-MM-DD or DD/MM/YYYY.
          Rows with an email that already exists are skipped.
        </p>
        <div className="row gap">
          <button type="button" className="btn" onClick={() => fileRef.current.click()}><FileUp size={16} /> Choose file…</button>
          <span className="muted small">{fileName || 'No file selected'}</span>
          <button type="button" className="link ml-auto" onClick={template}>Download template</button>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={pick} />
        <ErrorNotice error={error} />

        {rows && !result && (
          <div>
            <p className="small"><strong>{rows.length}</strong> row{rows.length === 1 ? '' : 's'} found. Preview:</p>
            <div className="table-wrap bordered">
              <table className="table table-compact">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}><td>{r.first_name} {r.last_name}</td><td>{r.email}</td><td>{r.position}</td><td>{r.date_joined}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && <p className="muted small">…and {rows.length - 5} more.</p>}
          </div>
        )}

        {result && (
          <div className="stack">
            <div className="notice notice-success">Imported {result.created} {result.created === 1 ? t.participant : t.participants}. {result.skipped.length} row{result.skipped.length === 1 ? '' : 's'} skipped.</div>
            {result.skipped.length > 0 && (
              <div className="table-wrap bordered">
                <table className="table table-compact">
                  <thead><tr><th>Line</th><th>Name</th><th>Reason</th></tr></thead>
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
        <button type="button" className="btn" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
        {!result && (
          <button type="button" className="btn btn-primary" disabled={!rows || busy} onClick={runImport}>
            {busy ? 'Importing…' : `Import ${rows ? rows.length : ''} ${rows?.length === 1 ? t.participant : t.participants}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
