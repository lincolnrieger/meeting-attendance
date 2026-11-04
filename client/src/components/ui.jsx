/** Small presentational building blocks shared across pages. */
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { STATUS_BY_VALUE, MEETING_STATUS_LABEL } from '../lib/attendance';

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <header className="page-header">
      <div>
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, className = '', flush }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-header">
          {title && <h2>{title}</h2>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'panel-flush' : 'panel-body'}>{children}</div>
    </section>
  );
}

const AVATAR_TONES = ['#5b7083', '#6b7d5c', '#8a6a55', '#5f6b8c', '#7a6383', '#4f7a78', '#86704a', '#6d6d6d'];

export function Avatar({ person, size = 32 }) {
  const name = `${person.first_name || ''} ${person.last_name || ''}`.trim();
  const initials = `${(person.first_name || '?')[0]}${(person.last_name || '')[0] || ''}`.toUpperCase();
  const tone = AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (person.photo) return <img className="avatar" src={person.photo} alt="" style={style} />;
  return (
    <span className="avatar" style={{ ...style, background: tone }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function AttendanceBadge({ status }) {
  if (!status) return <span className="badge badge-unrecorded">Not recorded</span>;
  return <span className={`badge badge-${status}`}>{STATUS_BY_VALUE[status]?.label || status}</span>;
}

export function MeetingStatusBadge({ status, held }) {
  if (status === 'upcoming' && held) return <span className="badge badge-overdue" title="The meeting date has passed but it has not been marked completed.">Awaiting close</span>;
  return <span className={`badge badge-m-${status}`}>{MEETING_STATUS_LABEL[status]}</span>;
}

export function SampleTag() {
  return <span className="tag-sample" title="Fictional demonstration record — replace or remove before real use">Sample</span>;
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={22} strokeWidth={1.5} />}
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="loading">{label}</div>;
}

export function ErrorNotice({ error }) {
  if (!error) return null;
  return (
    <div className="notice notice-error">
      <AlertCircle size={16} />
      <span>{typeof error === 'string' ? error : error.message}</span>
    </div>
  );
}

/** Labelled form field wrapper with inline error message. */
export function Field({ label, htmlFor, error, hint, required, children, className = '' }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}
          {required ? <span className="req" aria-hidden="true"> *</span> : <span className="optional"> (optional)</span>}
        </label>
      )}
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

/** Thin horizontal bar showing a percentage. */
export function RateBar({ rate }) {
  const v = rate == null ? 0 : Math.max(0, Math.min(100, rate));
  const tone = rate == null ? '' : rate >= 85 ? 'good' : rate >= 70 ? 'ok' : 'low';
  return (
    <span className="ratebar" aria-hidden="true">
      <span className={`ratebar-fill ${tone}`} style={{ width: `${v}%` }} />
    </span>
  );
}

/** Horizontal stacked bar of attendance status counts with legend. */
export function StatusBreakdown({ summary, showLegend = true }) {
  const parts = ['present', 'late', 'left_early', 'online', 'apology', 'absent']
    .map((k) => ({ key: k, n: summary[k] || 0 }))
    .concat([{ key: 'unrecorded', n: summary.unrecorded || 0 }]);
  const total = parts.reduce((a, p) => a + p.n, 0);
  return (
    <div className="breakdown">
      <div className="breakdown-bar" role="img" aria-label="Attendance breakdown">
        {total > 0 &&
          parts.filter((p) => p.n).map((p) => (
            <span key={p.key} className={`seg seg-${p.key}`} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.key === 'unrecorded' ? 'Not recorded' : STATUS_BY_VALUE[p.key].label}: ${p.n}`} />
          ))}
      </div>
      {showLegend && (
        <ul className="legend">
          {parts.map((p) => (
            <li key={p.key} className={p.n ? '' : 'zero'}>
              <span className={`dot seg-${p.key}`} />
              {p.key === 'unrecorded' ? 'Not recorded' : STATUS_BY_VALUE[p.key].label}
              <strong>{p.n}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Avatar + name + position, linking to the participant profile. */
export function PersonCell({ p, id = p.id, sample }) {
  return (
    <Link to={`/participants/${id}`} className="person">
      <Avatar person={p} size={28} />
      <span className="person-text">
        <span className="person-name">
          {p.first_name} {p.last_name}
          {sample && <SampleTag />}
        </span>
        <span className="person-sub">{p.position}</span>
      </span>
    </Link>
  );
}
