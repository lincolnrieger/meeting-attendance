import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileUp, Info, Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAppSettings } from '../lib/settings';
import { formatRate } from '../lib/attendance';
import { downloadCSV } from '../lib/csv';
import { exportFieldValue } from '../lib/customFields';
import { formatDate, fullName, todayISO } from '../lib/format';
import { EmptyState, ErrorNotice, Loading, PageHeader, PersonCell, RateBar } from '../components/ui';
import { useConfirm, useToast } from '../components/Feedback';
import ImportDialog, { TEMPLATE_COLUMNS } from '../components/ImportDialog';


export default function Participants() {
  const { data, error, loading, reload } = useApi('/participants');
  const { t, fields } = useAppSettings();
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
        (!q || fullName(p).toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.position.toLowerCase().includes(q) ||
          Object.values(p.custom || {}).some((v) => String(v).toLowerCase().includes(q))),
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
    // Same leading columns as the import template, so an export can be re-imported.
    downloadCSV(`${t.participants.replace(/\s+/g, '-')}-${todayISO()}.csv`, rows, [
      ...TEMPLATE_COLUMNS,
      ...fields.map((f) => ({ label: f.label, value: (r) => exportFieldValue(f, r.custom?.[f.id]) })),
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
            <button className="btn" onClick={() => setShowImport(true)}><FileUp size={16} /> Import</button>
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
            placeholder="Search by name, email, role or any detail"
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

      {showImport && <ImportDialog onClose={() => setShowImport(false)} onDone={reload} />}
    </>
  );
}
