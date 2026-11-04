/**
 * Meeting details and attendance register. Route: /meetings/:id
 *
 * Each change is saved to the server immediately (optimistic update with
 * rollback on failure). A status indicator in the register toolbar shows
 * when changes are being saved and when everything is up to date.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, Calendar, CheckCheck, CheckCircle2, Clock, Copy, Download, Loader2, MapPin, Pencil, RotateCcw, Search, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAppSettings } from '../lib/settings';
import { formatRate, STATUSES, statusLabel } from '../lib/attendance';
import { downloadCSV } from '../lib/csv';
import { formatDateLong, formatTimeRange, fullName } from '../lib/format';
import { Avatar, EmptyState, ErrorNotice, Loading, MeetingStatusBadge, PageHeader, Panel, SampleTag } from '../components/ui';
import { useConfirm, useToast } from '../components/Feedback';

export default function MeetingDetail() {
  const { id } = useParams();
  const { data, error, loading, reload, setData } = useApi(`/meetings/${id}`);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { t } = useAppSettings();

  if (error) return <ErrorNotice error={error} />;
  if (loading && !data) return <Loading />;
  const { meeting: m } = data;

  async function setStatus(status, { title, message, label, danger }) {
    if (!(await confirm({ title, message, confirmLabel: label, danger }))) return;
    try {
      await api.patch(`/meetings/${m.id}/status`, { status });
      toast(`${t.Event} marked ${status}.`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${t.event}`,
      message: `Permanently delete "${m.title}" and all ${data.attendees.length} attendance records? This cannot be undone. To keep a record that it didn't go ahead, cancel the ${t.event} instead.`,
      confirmLabel: `Delete ${t.event}`,
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/meetings/${m.id}`);
      toast(`${t.Event} deleted.`);
      navigate('/meetings');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const unrecorded = data.summary.unrecorded;

  return (
    <>
      <PageHeader
        breadcrumb={<Link to="/meetings">{t.Events}</Link>}
        title={<>{m.title} {m.is_sample ? <SampleTag /> : null}</>}
        actions={
          <>
            <Link to={`/meetings/${m.id}/edit`} className="btn"><Pencil size={16} /> Edit</Link>
            <Link to={`/meetings/new?duplicate=${m.id}`} className="btn"><Copy size={16} /> Duplicate</Link>
            {m.status === 'upcoming' && (
              <button className="btn" onClick={() => setStatus('completed', {
                title: `Mark ${t.event} as completed`,
                message: unrecorded ? `${unrecorded} ${unrecorded === 1 ? `${t.participant} still has` : `${t.participants} still have`} no attendance recorded. You can still record it after completing the ${t.event}.` : `The ${t.event} will be counted in attendance statistics.`,
                label: 'Mark completed',
              })}><CheckCircle2 size={16} /> Mark completed</button>
            )}
            {m.status !== 'cancelled' ? (
              <button className="btn" onClick={() => setStatus('cancelled', {
                title: `Cancel ${t.event}`,
                message: `The ${t.event} will be marked as cancelled and excluded from attendance statistics. Recorded attendance is kept and the ${t.event} can be reinstated later.`,
                label: `Cancel ${t.event}`,
                danger: true,
              })}><Ban size={16} /> Cancel {t.event}</button>
            ) : (
              <button className="btn" onClick={() => setStatus('upcoming', { title: `Reinstate ${t.event}`, message: `The ${t.event} will be restored with the status Upcoming.`, label: 'Reinstate' })}>
                <RotateCcw size={16} /> Reinstate
              </button>
            )}
            {m.status === 'completed' && (
              <button className="btn btn-ghost" onClick={() => setStatus('upcoming', { title: `Reopen ${t.event}`, message: 'Set the status back to Upcoming?', label: 'Reopen' })}>Reopen</button>
            )}
            <button className="icon-btn danger" title={`Delete ${t.event}`} aria-label={`Delete ${t.event}`} onClick={remove}><Trash2 size={17} /></button>
          </>
        }
      />

      <div className="meeting-meta">
        <MeetingStatusBadge status={m.status} held={m.held} />
        <span className="icon-text"><Calendar size={15} /> {formatDateLong(m.date)}</span>
        <span className="icon-text"><Clock size={15} /> {formatTimeRange(m.start_time, m.end_time)}</span>
        <span className="icon-text"><MapPin size={15} /> {m.location}</span>
        <span className="icon-text"><Users size={15} /> {data.attendees.length} invited</span>
      </div>

      {m.status === 'cancelled' && <div className="notice notice-warn"><Ban size={16} /> This {t.event} was cancelled. Attendance can't be changed unless the {t.event} is reinstated.</div>}

      <div className="detail-grid">
        <Register meetingData={data} setData={setData} t={t} />
        <Panel title="Agenda" className="agenda-panel">
          {m.description ? <div className="pre agenda">{m.description}</div> : <p className="muted">No agenda has been added. <Link to={`/meetings/${m.id}/edit`} className="link">Add one</Link></p>}
        </Panel>
      </div>
    </>
  );
}

function Register({ meetingData, setData, t }) {
  const { meeting: m, attendees, summary } = meetingData;
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') || 'all';
  const [q, setQ] = useState('');
  const [pending, setPending] = useState(0);
  const [lastSaved, setLastSaved] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const readOnly = m.status === 'cancelled';

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return attendees.filter((a) => (filter === 'all' || !a.status) && (!s || fullName(a).toLowerCase().includes(s)));
  }, [attendees, filter, q]);

  /** Save one participant's record. `patch` contains status and/or notes. */
  async function save(pid, patch) {
    const before = attendees.find((a) => a.participant_id === pid);
    setData((d) => ({ ...d, attendees: d.attendees.map((a) => (a.participant_id === pid ? { ...a, ...patch } : a)) }));
    setPending((n) => n + 1);
    try {
      const res = await api.put(`/meetings/${m.id}/attendance/${pid}`, patch);
      setData((d) => ({ ...d, summary: res.summary }));
      setLastSaved(new Date());
    } catch (e) {
      setData((d) => ({ ...d, attendees: d.attendees.map((a) => (a.participant_id === pid ? before : a)) }));
      toast(`Could not save attendance for ${fullName(before)}: ${e.message}`, 'error');
    } finally {
      setPending((n) => n - 1);
    }
  }

  async function bulk(onlyUnrecorded) {
    const overwriting = attendees.filter((a) => a.status && a.status !== 'present').length;
    if (!onlyUnrecorded && overwriting) {
      const ok = await confirm({
        title: 'Mark everyone present?',
        message: `${overwriting} ${overwriting === 1 ? `${t.participant} has` : `${t.participants} have`} a different status recorded (e.g. apology or absent). Marking everyone present will replace ${overwriting === 1 ? 'it' : 'them'}.`,
        confirmLabel: 'Mark all present',
      });
      if (!ok) return;
    }
    setPending((n) => n + 1);
    try {
      const res = await api.post(`/meetings/${m.id}/attendance/bulk`, { status: 'present', only_unrecorded: onlyUnrecorded });
      setData((d) => ({
        ...d,
        summary: res.summary,
        attendees: d.attendees.map((a) => (!onlyUnrecorded || !a.status ? { ...a, status: 'present' } : a)),
      }));
      setLastSaved(new Date());
      toast(`${res.updated} ${res.updated === 1 ? t.participant : t.participants} marked present.`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPending((n) => n - 1);
    }
  }

  function exportRegister() {
    downloadCSV(`attendance-${m.date}-${m.title}.csv`.toLowerCase().replace(/[^a-z0-9.-]+/g, '-'), attendees, [
      { value: (a) => a.first_name, label: 'First name' },
      { value: (a) => a.last_name, label: 'Last name' },
      { key: 'position', label: 'Role' },
      { key: 'email', label: 'Email' },
      { value: (a) => statusLabel(a.status), label: 'Attendance' },
      { key: 'notes', label: 'Notes' },
    ]);
  }

  const setFilter = (f) => {
    const next = new URLSearchParams(params);
    f === 'all' ? next.delete('filter') : next.set('filter', f);
    setParams(next, { replace: true });
  };

  return (
    <section className="panel register">
      <div className="panel-header">
        <h2>Attendance register</h2>
        <div className="panel-actions">
          <SaveIndicator pending={pending} lastSaved={lastSaved} />
          <button className="btn btn-sm btn-ghost" onClick={exportRegister}><Download size={15} /> Export</button>
        </div>
      </div>

      <RegisterTotals summary={summary} />

      {!readOnly && attendees.length > 0 && (
        <div className="register-toolbar">
          <button className="btn btn-primary btn-sm" onClick={() => bulk(false)}><CheckCheck size={15} /> Mark all present</button>
          {summary.unrecorded > 0 && summary.recorded > 0 && (
            <button className="btn btn-sm" onClick={() => bulk(true)}>Mark remaining {summary.unrecorded} present</button>
          )}
          <div className="segmented segmented-sm ml-auto">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All <span className="count">{attendees.length}</span></button>
            <button className={filter === 'unrecorded' ? 'on' : ''} onClick={() => setFilter('unrecorded')}>Not recorded <span className="count">{summary.unrecorded}</span></button>
          </div>
          <div className="search search-sm">
            <Search size={15} />
            <input className="input" type="search" placeholder="Find" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Find ${t.participant}`} />
          </div>
        </div>
      )}

      {attendees.length === 0 ? (
        <EmptyState icon={Users} title={`No ${t.participants} invited`}>
          <Link to={`/meetings/${m.id}/edit`} className="link">Add {t.participants} to this {t.event}</Link>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={filter === 'unrecorded' ? 'Everyone has attendance recorded' : `No ${t.participants} match`} />
      ) : (
        <ul className="register-list">
          {rows.map((a) => (
            <RegisterRow key={a.participant_id} a={a} readOnly={readOnly} onSave={(patch) => save(a.participant_id, patch)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RegisterTotals({ summary }) {
  return (
    <div className="register-totals">
      <div className="rt-main">
        <span className="rt-rate">{formatRate(summary.rate)}</span>
        <span className="rt-label">
          attendance
          <span className="muted"> · {summary.attended} of {summary.recorded} recorded</span>
        </span>
      </div>
      <ul className="rt-counts">
        {STATUSES.map((s) => (
          <li key={s.value} className={summary[s.value] ? '' : 'zero'}>
            <span className={`dot seg-${s.value}`} />
            {s.short} <strong>{summary[s.value]}</strong>
          </li>
        ))}
        <li className={summary.unrecorded ? 'rt-unrecorded' : 'zero'}>
          <span className="dot seg-unrecorded" />
          Not recorded <strong>{summary.unrecorded}</strong>
        </li>
      </ul>
    </div>
  );
}

function RegisterRow({ a, readOnly, onSave }) {
  const [notes, setNotes] = useState(a.notes || '');
  const [showNotes, setShowNotes] = useState(Boolean(a.notes));
  const notesRef = useRef(null);

  useEffect(() => setNotes(a.notes || ''), [a.notes]);

  const commitNotes = () => {
    if ((a.notes || '') !== notes.trim()) onSave({ notes: notes.trim() });
  };

  return (
    <li className={`register-row ${a.status ? '' : 'unrecorded'}`}>
      <div className="rr-person">
        <Avatar person={a} size={32} />
        <span className="person-text">
          <Link to={`/participants/${a.participant_id}`} className="person-name cell-link">{fullName(a)}</Link>
          <span className="person-sub">{a.position}{a.participant_status === 'inactive' ? ' · inactive' : ''}</span>
          {!a.status && <span className="rr-flag">Attendance not recorded</span>}
        </span>
      </div>

      <div className="rr-status">
        {/* Button group on larger screens, dropdown on small screens. */}
        <div className="status-buttons" role="radiogroup" aria-label={`Attendance for ${fullName(a)}`}>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={a.status === s.value}
              disabled={readOnly}
              className={`sb sb-${s.value} ${a.status === s.value ? 'on' : ''}`}
              onClick={() => onSave({ status: a.status === s.value ? null : s.value })}
              title={a.status === s.value ? 'Click again to clear' : s.label}
            >
              {s.short}
            </button>
          ))}
        </div>
        <select
          className={`input status-select ${a.status ? `sel-${a.status}` : ''}`}
          value={a.status || ''}
          disabled={readOnly}
          onChange={(e) => onSave({ status: e.target.value || null })}
          aria-label={`Attendance for ${fullName(a)}`}
        >
          <option value="">Not recorded</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="rr-notes">
        {showNotes || notes ? (
          <input
            ref={notesRef}
            className="input input-sm"
            placeholder="Note (optional)"
            value={notes}
            maxLength={1000}
            disabled={readOnly}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label={`Notes for ${fullName(a)}`}
          />
        ) : (
          !readOnly && (
            <button type="button" className="link small" onClick={() => { setShowNotes(true); setTimeout(() => notesRef.current?.focus(), 0); }}>
              + Add note
            </button>
          )
        )}
      </div>
    </li>
  );
}

function SaveIndicator({ pending, lastSaved }) {
  if (pending > 0) return <span className="save-state"><Loader2 size={14} className="spin" /> Saving…</span>;
  if (lastSaved) return <span className="save-state saved"><CheckCircle2 size={14} /> All changes saved</span>;
  return <span className="save-state muted">Changes save automatically</span>;
}
