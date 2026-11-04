import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ClipboardCheck, Copy, Search } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useAppSettings } from '../lib/settings';
import { formatRate } from '../lib/attendance';
import { formatDate, formatTimeRange, formatWeekday, relativeDay } from '../lib/format';
import { EmptyState, ErrorNotice, Loading, MeetingStatusBadge, PageHeader, RateBar, SampleTag } from '../components/ui';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Previous' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

export default function Meetings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'upcoming';
  const [search, setSearch] = useState('');
  const { data, error, loading } = useApi(`/meetings?scope=${tab}`);
  const navigate = useNavigate();
  const { t } = useAppSettings();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.meetings || []).filter((m) => !q || m.title.toLowerCase().includes(q) || m.location.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <>
      <PageHeader
        title={t.Events}
        subtitle={`Schedule ${t.events}, manage invitations and record attendance.`}
        actions={<Link to="/meetings/new" className="btn btn-primary"><CalendarPlus size={16} /> New {t.event}</Link>}
      />

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {TABS.map((tb) => (
            <button key={tb.key} role="tab" aria-selected={tab === tb.key} className={tab === tb.key ? 'on' : ''} onClick={() => setParams(tb.key === 'upcoming' ? {} : { tab: tb.key }, { replace: true })}>
              {tb.label}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={16} />
          <input className="input" type="search" placeholder="Search title or location" value={search} onChange={(e) => setSearch(e.target.value)} aria-label={`Search ${t.events}`} />
        </div>
      </div>

      <ErrorNotice error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="panel">
          {rows.length === 0 ? (
            <EmptyState icon={CalendarDays} title={search ? `No ${t.events} match your search` : `No ${tab === 'all' ? '' : TABS.find((tb) => tb.key === tab).label.toLowerCase() + ' '}${t.events}`}>
              {tab === 'upcoming' && <Link to="/meetings/new" className="link">Schedule a {t.event}</Link>}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>{t.Event}</th>
                    <th className="hide-md">Time</th>
                    <th className="num hide-sm">Invited</th>
                    <th className="rate-col">Attendance</th>
                    <th>Status</th>
                    <th className="actions-col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className={`clickable ${m.status === 'cancelled' ? 'row-inactive' : ''}`} onClick={(e) => !e.target.closest('a,button') && navigate(`/meetings/${m.id}`)}>
                      <td className="nowrap">
                        <div className="date-cell">
                          <strong>{formatWeekday(m.date)} {formatDate(m.date)}</strong>
                          {tab === 'upcoming' && <span className="muted small">{relativeDay(m.date)}</span>}
                        </div>
                      </td>
                      <td>
                        <Link to={`/meetings/${m.id}`} className="cell-link">{m.title}</Link> {m.is_sample ? <SampleTag /> : null}
                        <div className="muted small">{m.location}</div>
                      </td>
                      <td className="hide-md nowrap muted">{formatTimeRange(m.start_time, m.end_time)}</td>
                      <td className="num hide-sm">{m.invited}</td>
                      <td className="rate-col">
                        {m.status === 'cancelled' ? (
                          <span className="muted">—</span>
                        ) : m.held ? (
                          <>
                            <span className="rate"><RateBar rate={m.rate} /> {formatRate(m.rate)}</span>
                            {m.unrecorded > 0 && <div className="warn-text small">{m.unrecorded} not recorded</div>}
                          </>
                        ) : (
                          <span className="muted small">{m.apology ? `${m.apology} apolog${m.apology === 1 ? 'y' : 'ies'} received` : 'Not yet held'}</span>
                        )}
                      </td>
                      <td><MeetingStatusBadge status={m.status} held={m.held} /></td>
                      <td className="actions-col">
                        <Link to={`/meetings/${m.id}`} className="icon-btn" title="Attendance register" aria-label="Attendance register"><ClipboardCheck size={15} /></Link>
                        <Link to={`/meetings/new?duplicate=${m.id}`} className="icon-btn" title={`Duplicate ${t.event}`} aria-label={`Duplicate ${t.event}`}><Copy size={15} /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 0 && <div className="table-foot">{rows.length} {rows.length === 1 ? t.event : t.events}</div>}
        </div>
      )}
    </>
  );
}
