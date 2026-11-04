import { useEffect, useMemo, useState } from 'react';
import { Building2, Database, KeyRound, ListChecks } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAppSettings } from '../lib/settings';
import { PRESETS } from '../lib/presets';
import { ErrorNotice, Field, PageHeader, Panel } from '../components/ui';
import { useConfirm, useToast } from '../components/Feedback';

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Organisation, terminology, form suggestions, account and sample data." />
      <OrganisationSettings />
      <div className="settings-grid">
        <PasswordPanel />
        <SampleDataPanel />
      </div>
    </>
  );
}

const LISTS = [
  { key: 'role_suggestions', label: 'Roles', hint: 'Suggested when adding or editing a person, e.g. Teacher, Scout Leader, Coach.' },
  { key: 'title_suggestions', label: 'Titles', hint: 'Suggested for the title when creating a session, e.g. Weekly Troop Meeting, Mathematics.' },
  { key: 'location_suggestions', label: 'Locations', hint: 'Suggested for the location field, e.g. Scout Hall, Classroom 4.' },
];

/** Turn saved settings into editable form values (lists become one item per line). */
const toForm = (s) => ({
  ...s,
  ...Object.fromEntries(LISTS.map(({ key }) => [key, (s[key] || []).join('\n')])),
});
const fromForm = (f) => ({
  ...f,
  ...Object.fromEntries(LISTS.map(({ key }) => [key, f[key].split('\n').map((v) => v.trim()).filter(Boolean)])),
});
const countLines = (text) => text.split('\n').filter((v) => v.trim()).length;

function OrganisationSettings() {
  const { settings, save } = useAppSettings();
  const [form, setForm] = useState(() => toForm(settings));
  const [preset, setPreset] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  // Load the saved values once they arrive (the context loads asynchronously).
  useEffect(() => setForm(toForm(settings)), [settings]);

  const dirty = useMemo(() => JSON.stringify(toForm(settings)) !== JSON.stringify(form), [settings, form]);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function applyPreset() {
    const p = PRESETS.find((x) => x.key === preset);
    if (!p) return;
    const ok = await confirm({
      title: `Use the "${p.label}" template?`,
      message: `This fills in the terminology (${p.participant[1]} and ${p.event[1]}) and replaces the role, title and location suggestions below. Nothing is saved until you click Save, and your existing records are not changed.`,
      confirmLabel: 'Apply template',
    });
    if (!ok) return;
    setForm((f) => ({
      ...f,
      participant_singular: p.participant[0],
      participant_plural: p.participant[1],
      event_singular: p.event[0],
      event_plural: p.event[1],
      role_suggestions: p.roles.join('\n'),
      title_suggestions: p.titles.join('\n'),
      location_suggestions: p.locations.join('\n'),
    }));
    setErrors({});
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await save(fromForm(form));
      setErrors({});
      toast('Settings saved.');
    } catch (err) {
      setErrors(err.errors || {});
      if (!err.errors) toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const input = (k, props = {}) => (
    <input id={k} className="input" value={form[k] || ''} onChange={set(k)} aria-invalid={Boolean(errors[k])} {...props} />
  );

  return (
    <form onSubmit={submit} className="org-settings" noValidate>
      <Panel title={<span className="icon-text"><Building2 size={16} /> Organisation and terminology</span>}>
        <div className="template-row">
          <div className="field grow">
            <label htmlFor="preset">Start from a template</label>
            <select id="preset" className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="">Choose a type of group…</option>
              {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn" onClick={applyPreset} disabled={!preset}>Apply template</button>
        </div>

        <div className="form-grid">
          <Field label="Organisation name" htmlFor="organisation_name" error={errors.organisation_name} required className="span-2" hint="Shown in the sidebar, on the sign-in page and in the browser tab.">
            {input('organisation_name', { placeholder: 'e.g. 1st Riverside Scout Group' })}
          </Field>
          <div className="field">
            <span className="field-label">People are called <span className="req" aria-hidden="true">*</span></span>
            <div className="field-pair">
              {input('participant_singular', { placeholder: 'Student', 'aria-label': 'Singular, e.g. Student' })}
              {input('participant_plural', { placeholder: 'Students', 'aria-label': 'Plural, e.g. Students' })}
            </div>
            {(errors.participant_singular || errors.participant_plural) ? <p className="field-error">Enter both the singular and plural.</p> : <p className="field-hint">Singular and plural, e.g. Student / Students.</p>}
          </div>
          <div className="field">
            <span className="field-label">Sessions are called <span className="req" aria-hidden="true">*</span></span>
            <div className="field-pair">
              {input('event_singular', { placeholder: 'Class', 'aria-label': 'Singular, e.g. Class' })}
              {input('event_plural', { placeholder: 'Classes', 'aria-label': 'Plural, e.g. Classes' })}
            </div>
            {(errors.event_singular || errors.event_plural) ? <p className="field-error">Enter both the singular and plural.</p> : <p className="field-hint">Singular and plural, e.g. Class / Classes or Meeting / Meetings.</p>}
          </div>
        </div>
      </Panel>

      <Panel title={<span className="icon-text"><ListChecks size={16} /> Form suggestions</span>}>
        <p className="muted mb">
          These appear as suggestions while typing in forms. Enter one per line — any value can still be typed in by hand.
        </p>
        <div className="suggestion-grid">
          {LISTS.map(({ key, label, hint }) => (
            <Field key={key} label={<>{label} <span className="muted small">({countLines(form[key])})</span></>} htmlFor={key} error={errors[key]} hint={hint}>
              <textarea id={key} className="input suggestion-list" rows={9} value={form[key]} onChange={set(key)} spellCheck="false" />
            </Field>
          ))}
        </div>
      </Panel>

      <div className="form-actions sticky-actions">
        {dirty && <span className="muted small">You have unsaved changes</span>}
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => { setForm(toForm(settings)); setErrors({}); }}>Discard</button>
        <button className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </div>
    </form>
  );
}

function PasswordPanel() {
  const [values, setValues] = useState({ current_password: '', new_password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (values.new_password !== values.confirm) return setErrors({ confirm: 'Passwords do not match.' });
    setBusy(true);
    try {
      await api.post('/auth/change-password', values);
      setValues({ current_password: '', new_password: '', confirm: '' });
      setErrors({});
      toast('Password changed.');
    } catch (err) {
      setErrors(err.errors || {});
      if (!err.errors) setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={<span className="icon-text"><KeyRound size={16} /> Change password</span>}>
      <form onSubmit={submit} className="stack" noValidate>
        <ErrorNotice error={error} />
        <Field label="Current password" htmlFor="cp" error={errors.current_password} required>
          <input id="cp" type="password" className="input" autoComplete="current-password" value={values.current_password} onChange={set('current_password')} />
        </Field>
        <Field label="New password" htmlFor="np" error={errors.new_password} hint="At least 8 characters." required>
          <input id="np" type="password" className="input" autoComplete="new-password" value={values.new_password} onChange={set('new_password')} />
        </Field>
        <Field label="Confirm new password" htmlFor="cf" error={errors.confirm} required>
          <input id="cf" type="password" className="input" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />
        </Field>
        <div><button className="btn btn-primary" disabled={busy}>Update password</button></div>
      </form>
    </Panel>
  );
}

function SampleDataPanel() {
  const { data, reload } = useApi('/settings/sample-data');
  const confirm = useConfirm();
  const toast = useToast();
  const total = data ? data.participants + data.meetings : 0;

  async function removeAll() {
    const ok = await confirm({
      title: 'Remove all sample data',
      message: `This permanently deletes ${data.participants} sample people and ${data.meetings} sample sessions, together with their attendance records. Records you have added yourself are kept.`,
      confirmLabel: 'Remove sample data',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api.del('/settings/sample-data');
      toast(`Removed ${r.participants} people and ${r.meetings} sessions.`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function restore() {
    try {
      const r = await api.post('/settings/sample-data');
      toast(`Loaded ${r.participants} sample people and ${r.meetings} sessions.`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <Panel title={<span className="icon-text"><Database size={16} /> Sample data</span>}>
      <div className="stack">
        <p>
          The system was pre-loaded with <strong>fictional demonstration records</strong> for a community group — people,
          sessions and attendance — so the dashboard and reports can be explored straight away. Sample records are labelled <span className="tag-sample">Sample</span> throughout.
        </p>
        {data && (
          total > 0 ? (
            <>
              <p className="muted">Currently loaded: {data.participants} sample people and {data.meetings} sample sessions.</p>
              <div><button className="btn btn-danger-outline" onClick={removeAll}>Remove all sample data</button></div>
            </>
          ) : (
            <>
              <p className="muted">No sample data is loaded.</p>
              <div><button className="btn" onClick={restore}>Load sample data</button></div>
            </>
          )
        )}
      </div>
    </Panel>
  );
}
