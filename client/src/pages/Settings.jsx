import { useState } from 'react';
import { Database, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { ErrorNotice, Field, PageHeader, Panel } from '../components/ui';
import { useConfirm, useToast } from '../components/Feedback';

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Administrator account and demonstration data." />
      <div className="settings-grid">
        <PasswordPanel />
        <SampleDataPanel />
      </div>
    </>
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
      message: `This permanently deletes ${data.participants} sample participants and ${data.meetings} sample meetings, together with their attendance records. Records you have added yourself are kept.`,
      confirmLabel: 'Remove sample data',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api.del('/settings/sample-data');
      toast(`Removed ${r.participants} participants and ${r.meetings} meetings.`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function restore() {
    try {
      const r = await api.post('/settings/sample-data');
      toast(`Loaded ${r.participants} sample participants and ${r.meetings} meetings.`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <Panel title={<span className="icon-text"><Database size={16} /> Sample data</span>}>
      <div className="stack">
        <p>
          The system was pre-loaded with <strong>fictional demonstration records</strong> — board member profiles, meetings and
          attendance — so the dashboard and reports can be explored straight away. Sample records are labelled <span className="tag-sample">Sample</span> throughout.
        </p>
        {data && (
          total > 0 ? (
            <>
              <p className="muted">Currently loaded: {data.participants} sample participants and {data.meetings} sample meetings.</p>
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
