import { Link } from 'react-router-dom';
import { CalendarPlus, CheckCircle2, ChevronRight, UserPlus } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { formatRate } from '../lib/attendance';
import { formatDate, formatDateLong, formatTimeRange, formatWeekday, relativeDay, todayISO } from '../lib/format';
import { EmptyState, ErrorNotice, Loading, PageHeader, Panel, PersonCell, RateBar, StatusBreakdown } from '../components/ui';

export default function Dashboard() {
  const { data, error, loading } = useApi('/dashboard');

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={formatDateLong(todayISO())}
        actions={
          <>
            <Link to="/participants/new" className="btn"><UserPlus size={16} /> Add participant</Link>
            <Link to="/meetings/new" className="btn btn-primary"><CalendarPlus size={16} /> New meeting</Link>
          </>
        }
      />
      <ErrorNotice error={error} />
      {loading && !data ? <Loading /> : data && <DashboardBody d={data} />}
    </>
  );
}

function DashboardBody({ d }) {
  const outstandingTotal = d.outstandingMeetings.reduce((a, m) => a + m.unrecorded, 0);
  const latest = d.latest;

  return (
    <>
      <div className="kpis">
        <Kpi label="Registered participants" value={d.participants.total} sub={`${d.participants.active} active`} to="/participants" />
        <Kpi label="Meetings held" value={d.meetings.held} sub="Completed or past" to="/meetings?tab=past" />
        <Kpi label="Upcoming meetings" value={d.meetings.upcoming} sub={d.upcoming[0] ? `Next: ${formatDate(d.upcoming[0].date, { day: 'numeric', month: 'short' })}` : 'None scheduled'} to="/meetings" />
        <Kpi label="Overall attendance" value={formatRate(d.overall.rate)} sub={`${d.overall.attended} of ${d.overall.recorded} recorded`} to="/reports" />
        <Kpi label="Latest meeting" value={latest ? formatRate(latest.summary.rate) : '—'} sub={latest ? `${latest.summary.attended} of ${latest.summary.invited} attended` : 'No meetings yet'} to={latest ? `/meetings/${latest.meeting.id}` : '/meetings'} />
        <Kpi label="Outstanding records" value={outstandingTotal} sub={outstandingTotal ? `Across ${d.outstandingMeetings.length} meeting${d.outstandingMeetings.length === 1 ? '' : 's'}` : 'All up to date'} tone={outstandingTotal ? 'warn' : ''} />
      </div>

      <div className="grid-2">
        <Panel title="Upcoming meetings" actions={<Link to="/meetings" className="link">All meetings <ChevronRight size={14} /></Link>} flush>
          {d.upcoming.length === 0 ? (
            <EmptyState title="No upcoming meetings">
              <Link to="/meetings/new" className="link">Schedule a meeting</Link>
            </EmptyState>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meeting</th>
                  <th className="hide-sm">Location</th>
                  <th className="num">Expected</th>
                </tr>
              </thead>
              <tbody>
                {d.upcoming.map((m) => (
                  <tr key={m.id} className="row-link">
                    <td className="nowrap">
                      <div className="date-cell">
                        <strong>{formatWeekday(m.date)} {formatDate(m.date, { day: 'numeric', month: 'short' })}</strong>
                        <span className="muted">{formatTimeRange(m.start_time, m.end_time)}</span>
                      </div>
                    </td>
                    <td>
                      <Link to={`/meetings/${m.id}`} className="cell-link">{m.title}</Link>
                      <div className="muted small">{relativeDay(m.date)}</div>
                    </td>
                    <td className="hide-sm muted">{m.location}</td>
                    <td className="num">
                      <strong>{m.invited - m.apologies}</strong>
                      <div className="muted small">{m.apologies ? `${m.apologies} apolog${m.apologies === 1 ? 'y' : 'ies'}` : `of ${m.invited}`}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Latest meeting attendance" actions={latest && <Link to={`/meetings/${latest.meeting.id}`} className="link">Open register <ChevronRight size={14} /></Link>}>
          {!latest ? (
            <EmptyState title="No meetings have been held yet" />
          ) : (
            <div className="latest">
              <div className="latest-head">
                <div>
                  <Link to={`/meetings/${latest.meeting.id}`} className="cell-link strong">{latest.meeting.title}</Link>
                  <div className="muted small">{formatDateLong(latest.meeting.date)} · {latest.meeting.location}</div>
                </div>
                <div className="big-rate">{formatRate(latest.summary.rate)}</div>
              </div>
              <StatusBreakdown summary={latest.summary} />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Highest attendance" actions={<Link to="/reports" className="link">Full report <ChevronRight size={14} /></Link>} flush>
          {d.topMembers.length === 0 ? (
            <EmptyState title="Not enough attendance recorded yet" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="num">Attended</th>
                  <th className="rate-col">Rate</th>
                </tr>
              </thead>
              <tbody>
                {d.topMembers.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <PersonCell p={p} />
                    </td>
                    <td className="num">{p.attended} / {p.recorded}</td>
                    <td className="rate-col">
                      <span className="rate"><RateBar rate={p.rate} /> {formatRate(p.rate)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Outstanding attendance records" flush>
          {d.outstandingMembers.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All attendance is recorded">
              Every invited participant has a status for each meeting held.
            </EmptyState>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th className="num">Missing</th>
                    <th className="hide-sm">Most recent</th>
                  </tr>
                </thead>
                <tbody>
                  {d.outstandingMembers.map((p) => (
                    <tr key={p.id}>
                      <td><PersonCell p={p} /></td>
                      <td className="num"><span className="badge badge-unrecorded">{p.unrecorded}</span></td>
                      <td className="hide-sm muted">{formatDate(p.latest_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="panel-note">
                {d.outstandingMeetings.map((m) => (
                  <Link key={m.id} to={`/meetings/${m.id}?filter=unrecorded`} className="outstanding-link">
                    <span>Record {m.unrecorded} missing for <strong>{m.title}</strong></span>
                    <ChevronRight size={14} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, to, tone }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${tone || ''}`}>{value}</span>
      <span className="kpi-sub">{sub}</span>
    </>
  );
  return to ? <Link to={to} className="kpi">{body}</Link> : <div className="kpi">{body}</div>;
}
