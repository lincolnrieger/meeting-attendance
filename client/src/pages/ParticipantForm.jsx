/** Add / edit participant. Route: /participants/new and /participants/:id/edit */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { todayISO } from '../lib/format';
import { Avatar, ErrorNotice, Field, Loading, PageHeader, Panel, SampleTag } from '../components/ui';
import { useToast } from '../components/Feedback';

const EMPTY = {
  first_name: '', last_name: '', date_of_birth: '', email: '', phone: '',
  position: '', date_joined: todayISO(), status: 'active', notes: '', photo: null,
};

const POSITIONS = [
  'Chair', 'Deputy Chair', 'Treasurer', 'Company Secretary', 'Chief Executive Officer (ex officio)',
  'Non-Executive Director', 'Independent Director', 'Executive Director', 'Board Observer',
];

/** Client-side checks that mirror the server rules for instant feedback. */
function validate(v) {
  const e = {};
  if (!v.first_name.trim()) e.first_name = 'First name is required.';
  if (!v.last_name.trim()) e.last_name = 'Last name is required.';
  if (!v.email.trim()) e.email = 'Email address is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address.';
  if (v.phone && !/^[+()\d\s-]{6,20}$/.test(v.phone.trim())) e.phone = 'Enter a valid phone number.';
  if (!v.position.trim()) e.position = 'Position / board role is required.';
  if (!v.date_joined) e.date_joined = 'Date joined is required.';
  if (v.date_of_birth && v.date_of_birth >= todayISO()) e.date_of_birth = 'Date of birth must be in the past.';
  if (v.date_of_birth && v.date_joined && v.date_joined <= v.date_of_birth) e.date_joined = 'Date joined must be after date of birth.';
  return e;
}

/** Resize an image file to a square JPEG data URL (keeps the database small). */
function resizeImage(file, size = 192) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = URL.createObjectURL(file);
  });
}

export default function ParticipantForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef(null);
  const [values, setValues] = useState(editing ? null : EMPTY);
  const [isSample, setIsSample] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.get(`/participants/${id}`).then(({ participant: p }) => {
      setIsSample(Boolean(p.is_sample));
      setValues(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? (k === 'photo' ? null : '')])));
    }).catch(setFormError);
  }, [editing, id]);

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function choosePhoto(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const photo = await resizeImage(file);
      setValues((v) => ({ ...v, photo }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function submit(e) {
    e.preventDefault();
    const clientErrors = validate(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = editing ? await api.put(`/participants/${id}`, values) : await api.post('/participants', values);
      toast(editing ? 'Profile updated.' : 'Participant added.');
      navigate(`/participants/${res.participant.id}`);
    } catch (err) {
      setErrors(err.errors || {});
      setFormError(err);
      setSaving(false);
    }
  }

  if (!values) return formError ? <ErrorNotice error={formError} /> : <Loading />;

  const name = `${values.first_name} ${values.last_name}`.trim();
  const input = (k, props = {}) => (
    <input id={k} className="input" value={values[k] || ''} onChange={set(k)} aria-invalid={Boolean(errors[k])} {...props} />
  );

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/participants">Participants</Link>{editing && <> / <Link to={`/participants/${id}`}>{name}</Link></>}</>}
        title={editing ? 'Edit participant' : 'Add participant'}
      />
      {editing && isSample && (
        <div className="notice notice-info">This is a <SampleTag /> profile. Replace the details with real information, or delete it once no longer needed.</div>
      )}
      <form onSubmit={submit} noValidate className="form-layout">
        <ErrorNotice error={formError && !Object.keys(errors).length ? formError : null} />
        <Panel title="Personal details">
          <div className="photo-row">
            <Avatar person={{ ...values, first_name: values.first_name || '?', last_name: values.last_name }} size={64} />
            <div className="row gap">
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current.click()}><ImagePlus size={15} /> {values.photo ? 'Change photo' : 'Upload photo'}</button>
              {values.photo && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setValues((v) => ({ ...v, photo: null }))}><Trash2 size={15} /> Remove</button>}
              <span className="muted small">Optional. Initials are shown when no photo is set.</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={choosePhoto} />
          </div>
          {errors.photo && <p className="field-error">{errors.photo}</p>}
          <div className="form-grid">
            <Field label="First name" htmlFor="first_name" error={errors.first_name} required>{input('first_name', { autoFocus: !editing, autoComplete: 'off' })}</Field>
            <Field label="Last name" htmlFor="last_name" error={errors.last_name} required>{input('last_name', { autoComplete: 'off' })}</Field>
            <Field label="Email address" htmlFor="email" error={errors.email} required>{input('email', { type: 'email', autoComplete: 'off' })}</Field>
            <Field label="Phone number" htmlFor="phone" error={errors.phone}>{input('phone', { type: 'tel', placeholder: 'e.g. 0412 345 678' })}</Field>
            <Field label="Date of birth" htmlFor="date_of_birth" error={errors.date_of_birth}>{input('date_of_birth', { type: 'date', max: todayISO() })}</Field>
          </div>
        </Panel>

        <Panel title="Board membership">
          <div className="form-grid">
            <Field label="Position / board role" htmlFor="position" error={errors.position} required>
              {input('position', { list: 'positions', placeholder: 'e.g. Non-Executive Director' })}
              <datalist id="positions">{POSITIONS.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="Date joined" htmlFor="date_joined" error={errors.date_joined} required>{input('date_joined', { type: 'date' })}</Field>
            <Field label="Status" htmlFor="status" error={errors.status} required>
              <select id="status" className="input" value={values.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Notes" htmlFor="notes" error={errors.notes} className="span-2">
              <textarea id="notes" className="input" rows={4} value={values.notes || ''} onChange={set('notes')} />
            </Field>
          </div>
        </Panel>

        <div className="form-actions">
          <Link to={editing ? `/participants/${id}` : '/participants'} className="btn">Cancel</Link>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add participant'}</button>
        </div>
      </form>
    </>
  );
}
