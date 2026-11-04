/**
 * Create / edit / duplicate a meeting.
 * Routes: /meetings/new, /meetings/new?duplicate=:id, /meetings/:id/edit
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { fullName, todayISO } from '../lib/format';
import { Avatar, ErrorNotice, Field, Loading, PageHeader, Panel } from '../components/ui';
import { useConfirm, useToast } from '../components/Feedback';

const EMPTY = { title: '', date: '', start_time: '17:30', end_time: '19:30', location: '', description: '', status: 'upcoming' };

function validate(v, invitees) {
  const e = {};
  if (!v.title.trim()) e.title = 'Meeting title is required.';
  if (!v.date) e.date = 'Meeting date is required.';
  if (!v.start_time) e.start_time = 'Start time is required.';
  if (!v.end_time) e.end_time = 'Finish time is required.';
  else if (v.start_time && v.end_time <= v.start_time) e.end_time = 'Finish time must be after the start time.';
  if (!v.location.trim()) e.location = 'Location is required.';
  if (invitees.size === 0) e.participant_ids = 'Select at least one participant to invite.';
  return e;
}

export default function MeetingForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const duplicateId = params.get('duplicate');
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [values, setValues] = useState(null);
  const [invitees, setInvitees] = useState(new Set());
  const [original, setOriginal] = useState({ attendees: [] });
  const [people, setPeople] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sourceId = id || duplicateId;
    Promise.all([api.get('/participants'), sourceId ? api.get(`/meetings/${sourceId}`) : null])
      .then(([pRes, mRes]) => {
        setPeople(pRes.participants);
        if (mRes) {
          const m = mRes.meeting;
          const base = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, m[k] ?? '']));
          if (editing) {
            setValues(base);
            setOriginal({ attendees: mRes.attendees });
            setInvitees(new Set(mRes.attendees.map((a) => a.participant_id)));
          } else {
            // Duplicate: copy details and invitation list, but require a new date.
            setValues({ ...base, date: '', status: 'upcoming' });
            setInvitees(new Set(mRes.attendees.filter((a) => a.participant_status === 'active').map((a) => a.participant_id)));
          }
        } else {
          setValues(EMPTY);
          setInvitees(new Set(pRes.participants.filter((p) => p.status === 'active').map((p) => p.id)));
        }
      })
      .catch(setFormError);
  }, [id, duplicateId, editing]);

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    const clientErrors = validate(values, invitees);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    if (editing) {
      const losing = original.attendees.filter((a) => a.status && !invitees.has(a.participant_id));
      if (losing.length) {
        const ok = await confirm({
          title: 'Remove recorded attendance?',
          message: `Removing ${losing.map(fullName).join(', ')} from the invitation list will also delete their recorded attendance for this meeting.`,
          confirmLabel: 'Remove and save',
          danger: true,
        });
        if (!ok) return;
      }
    }

    setSaving(true);
    setFormError(null);
    const body = { ...values, participant_ids: [...invitees] };
    try {
      const res = editing ? await api.put(`/meetings/${id}`, body) : await api.post('/meetings', body);
      toast(editing ? 'Meeting updated.' : 'Meeting created.');
      navigate(`/meetings/${res.meeting.id}`);
    } catch (err) {
      setErrors(err.errors || {});
      setFormError(err);
      setSaving(false);
    }
  }

  if (!values) return formError ? <ErrorNotice error={formError} /> : <Loading />;

  const input = (k, props = {}) => (
    <input id={k} className="input" value={values[k] || ''} onChange={set(k)} aria-invalid={Boolean(errors[k])} {...props} />
  );

  const title = editing ? 'Edit meeting' : duplicateId ? 'Duplicate meeting' : 'New meeting';

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/meetings">Meetings</Link>{editing && <> / <Link to={`/meetings/${id}`}>{values.title}</Link></>}</>}
        title={title}
        subtitle={duplicateId ? 'Details and invitations have been copied. Choose a date for the new meeting.' : null}
      />
      <form onSubmit={submit} noValidate className="form-layout">
        <ErrorNotice error={formError && !Object.keys(errors).length ? formError : null} />
        <Panel title="Meeting details">
          <div className="form-grid">
            <Field label="Meeting title" htmlFor="title" error={errors.title} required className="span-2">
              {input('title', { placeholder: 'e.g. Board Meeting — March 2027', autoFocus: !editing })}
            </Field>
            <Field label="Date" htmlFor="date" error={errors.date} required hint={!editing && values.date && values.date < todayISO() ? 'This date is in the past — the meeting will be treated as already held.' : null}>
              {input('date', { type: 'date', autoFocus: Boolean(duplicateId) })}
            </Field>
            <div className="field-pair">
              <Field label="Start" htmlFor="start_time" error={errors.start_time} required>{input('start_time', { type: 'time', step: 300 })}</Field>
              <Field label="Finish" htmlFor="end_time" error={errors.end_time} required>{input('end_time', { type: 'time', step: 300 })}</Field>
            </div>
            <Field label="Location or meeting room" htmlFor="location" error={errors.location} required className={editing ? '' : 'span-2'}>
              {input('location', { placeholder: 'e.g. Boardroom, Level 4', list: 'locations' })}
              <datalist id="locations">
                <option value="Boardroom, Level 4, 120 Collins Street, Melbourne" />
                <option value="Meeting Room 2, Level 4" />
                <option value="Video conference (Microsoft Teams)" />
              </datalist>
            </Field>
            {editing && (
              <Field label="Status" htmlFor="status" required>
                <select id="status" className="input" value={values.status} onChange={set('status')}>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            )}
            <Field label="Description / agenda" htmlFor="description" error={errors.description} className="span-2">
              <textarea id="description" className="input" rows={7} value={values.description || ''} onChange={set('description')} placeholder={'1. Welcome and apologies\n2. Minutes of previous meeting\n3. …'} />
            </Field>
          </div>
        </Panel>

        <InviteePicker people={people} selected={invitees} onChange={(s) => { setInvitees(s); setErrors((er) => ({ ...er, participant_ids: undefined })); }} error={errors.participant_ids} />

        <div className="form-actions">
          <Link to={editing ? `/meetings/${id}` : '/meetings'} className="btn">Cancel</Link>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create meeting'}</button>
        </div>
      </form>
    </>
  );
}

function InviteePicker({ people, selected, onChange, error }) {
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) => (showInactive || p.status === 'active' || selected.has(p.id)) && (!s || fullName(p).toLowerCase().includes(s) || p.position.toLowerCase().includes(s)));
  }, [people, q, showInactive, selected]);

  const toggle = (pid) => {
    const next = new Set(selected);
    next.has(pid) ? next.delete(pid) : next.add(pid);
    onChange(next);
  };
  const selectAllActive = () => onChange(new Set([...selected, ...people.filter((p) => p.status === 'active').map((p) => p.id)]));

  return (
    <Panel
      title={<>Invited participants <span className="count-pill">{selected.size}</span></>}
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={selectAllActive}>Select all active</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(new Set())} disabled={!selected.size}>Clear</button>
        </>
      }
    >
      {error && <p className="field-error mb">{error}</p>}
      <div className="row gap mb">
        <div className="search grow">
          <Search size={16} />
          <input className="input" type="search" placeholder="Filter participants" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter participants" />
        </div>
        <label className="check-label">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>
      <div className="picker">
        {visible.map((p) => (
          <label key={p.id} className={`picker-item ${selected.has(p.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <Avatar person={p} size={26} />
            <span className="person-text">
              <span className="person-name">{fullName(p)}{p.status === 'inactive' && <span className="muted small"> · inactive</span>}</span>
              <span className="person-sub">{p.position}</span>
            </span>
          </label>
        ))}
        {visible.length === 0 && <p className="muted small">No participants match.</p>}
      </div>
    </Panel>
  );
}
