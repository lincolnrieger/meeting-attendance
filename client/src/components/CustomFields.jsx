/** Custom field building blocks: value input, "add a field" form and the Settings manager. */
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAppSettings } from '../lib/settings';
import { FIELD_TYPES, FIELD_TYPE_LABEL } from '../lib/customFields';
import { ErrorNotice } from './ui';
import { useConfirm, useToast } from './Feedback';

/** Input control for one custom field value. */
export function CustomFieldInput({ field, value, onChange, invalid }) {
  const id = `custom_${field.id}`;
  const common = { id, className: 'input', 'aria-invalid': Boolean(invalid) };
  switch (field.type) {
    case 'long_text':
      return <textarea {...common} rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <input {...common} type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input {...common} inputMode="decimal" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'yes_no':
      return (
        <select {...common} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    default:
      return <input {...common} value={value || ''} onChange={(e) => onChange(e.target.value)} autoComplete="off" />;
  }
}

/** Small inline form that creates a new custom field. Calls onCreated(field). */
export function AddFieldForm({ onCreated, onCancel, autoFocus = true }) {
  const { reloadFields } = useAppSettings();
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (!label.trim()) return setError('Enter a name for the field.');
    setBusy(true);
    setError(null);
    try {
      const { field } = await api.post('/custom-fields', { label, type });
      await reloadFields();
      setLabel('');
      setType('text');
      onCreated?.(field);
    } catch (err) {
      setError(err.errors?.label || err.errors?.type || err.message);
    } finally {
      setBusy(false);
    }
  }

  // Rendered inside other forms, so this is a div (nested <form>s are invalid) and Enter is handled here.
  return (
    <div className="add-field">
      <div className="add-field-row">
        <input
          className="input grow"
          placeholder="Field name, e.g. Membership number"
          aria-label="New field name"
          value={label}
          autoFocus={autoFocus}
          onChange={(e) => { setLabel(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(e); if (e.key === 'Escape') onCancel?.(); }}
        />
        <select className="input add-field-type" aria-label="Field type" value={type} onChange={(e) => setType(e.target.value)}>
          {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}><Plus size={15} /> Add field</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Settings panel body: list, rename, retype, reorder and delete custom fields. */
export function CustomFieldsManager() {
  const { fields, reloadFields, t } = useAppSettings();
  const [usage, setUsage] = useState({});
  const [editing, setEditing] = useState(null); // { id, label, type }
  const [error, setError] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const refresh = async () => {
    const d = await reloadFields();
    setUsage(d.usage || {});
  };
  useEffect(() => { refresh().catch(setError); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveEdit() {
    try {
      await api.put(`/custom-fields/${editing.id}`, { label: editing.label, type: editing.type });
      setEditing(null);
      await refresh();
      toast('Field updated.');
    } catch (err) {
      setError(err.errors?.label || err.errors?.type || err.message);
    }
  }

  async function move(index, delta) {
    const ids = fields.map((f) => f.id);
    const j = index + delta;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await api.put('/custom-fields/order', { ids });
      await refresh();
    } catch (err) {
      setError(err);
    }
  }

  async function remove(f) {
    const n = usage[f.id] || 0;
    const ok = await confirm({
      title: `Delete the "${f.label}" field?`,
      message: n
        ? `${n} ${n === 1 ? t.participant : t.participants} ${n === 1 ? 'has' : 'have'} a value in this field. Deleting it removes those values permanently.`
        : 'No one has a value in this field yet.',
      confirmLabel: 'Delete field',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/custom-fields/${f.id}`);
      await refresh();
      toast(`"${f.label}" was deleted.`);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="stack">
      <p className="muted">
        Record any extra details you need for each {t.participant} — e.g. membership number, emergency contact, or a
        screening expiry date. Fields appear on every profile and in the add / edit form, and are included in exports.
        Importing a spreadsheet can create them for you from its column headings.
      </p>
      <ErrorNotice error={error} />
      {fields.length > 0 && (
        <ul className="field-list">
          {fields.map((f, i) => (
            <li key={f.id}>
              {editing?.id === f.id ? (
                <>
                  <input
                    className="input grow"
                    aria-label="Field name"
                    value={editing.label}
                    autoFocus
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditing(null); }}
                  />
                  <select className="input add-field-type" aria-label="Field type" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                    {FIELD_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                  <button type="button" className="icon-btn" title="Save" aria-label="Save field" onClick={saveEdit}><Check size={15} /></button>
                  <button type="button" className="icon-btn" title="Cancel" aria-label="Cancel editing" onClick={() => { setEditing(null); setError(null); }}><X size={15} /></button>
                </>
              ) : (
                <>
                  <span className="field-list-name">{f.label}</span>
                  <span className="field-list-type">{FIELD_TYPE_LABEL[f.type]}</span>
                  <span className="muted small field-list-usage">{usage[f.id] || 0} filled</span>
                  <button type="button" className="icon-btn" title="Move up" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                  <button type="button" className="icon-btn" title="Move down" aria-label={`Move ${f.label} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                  <button type="button" className="icon-btn" title="Edit" aria-label={`Edit ${f.label}`} onClick={() => { setEditing({ id: f.id, label: f.label, type: f.type }); setError(null); }}><Pencil size={15} /></button>
                  <button type="button" className="icon-btn danger" title="Delete" aria-label={`Delete ${f.label}`} onClick={() => remove(f)}><Trash2 size={15} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {fields.length === 0 && <p className="muted small">No custom fields yet.</p>}
      <AddFieldForm autoFocus={false} onCreated={() => refresh().then(() => toast('Field added.'))} />
    </div>
  );
}
