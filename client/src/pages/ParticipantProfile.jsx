/** Individual attendance record. Route: /participants/:id */
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatRate, statusLabel, STATUS_BY_VALUE } from '../lib/attendance';
import { downloadCSV } from '../lib/csv';
import { age, formatDate, formatTimeRange, fullName } from '../lib/format';
import { AttendanceBadge, Avatar, EmptyState, ErrorNotice, Loading, MeetingStatusBadge, PageHeader, Panel, SampleTag, StatusBreakdown } from '../components/ui';
import { AttendanceStrip, RateLineChart } from '../components/Charts';
import { useConfirm, useToast } from '../components/Feedback';

export default function ParticipantProfile() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`/participants/${id}`);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  // Rolling attendance rate (last 4 recorded meetings) for the trend chart.
  const chart = useMemo(() => {
    if (!data) return { points: [], strip: [] };
    const held = data.history.filter((h) => h.held).slice().reverse(); // oldest first
    const recorded = held.filter((h) => h.status);
    const points = recorded.map((h, i) => {
      const window = recorded.slice(Math.max(0, i - 3), i + 1);
      const rate = Math.round((window.filter((w) => STATUS_BY_VALUE[w.status].attended).length / window.length) * 100);
      return {
        label: formatDate(h.date, { month: 'short', year: '2-digit' }),
        value: rate,
        tooltip: `${formatDate(h.date)} · ${h.title}: ${statusLabel(h.status)} (rolling ${rate}%)`,
      };
    });
    return { points, strip: held };
  }, [data]);

  if (error) return <ErrorNotice error={error} />;
  if (loading || !data) return <Loading />;
  const { participant: p, summary, history } = data;
  const upcoming = history.filter((h) => !h.held && h.meeting_status !== 'cancelled').reverse();

  async function remove() {
    const ok = await confirm({
      title: 'Delete participant',
      message: `Permanently delete ${fullName(p)} and all ${history.length} of their attendance records? This cannot be undone.`,
      confirmLabel: 'Delete participant',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/participants/${p.id}`);
      toast(`${fullName(p)} was deleted.`);
      navigate('/participants');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function exportHistory() {
    downloadCSV(`attendance-${p.first_name}-${p.last_name}.csv`.toLowerCase().replace(/[^a-z0-9.-]+/g, '-'), history, [
      { key: 'date', label: 'Date' },
      { key: 'title', label: 'Meeting' },
      { key: 'location', label: 'Location' },
      { value: (h) => (h.meeting_status === 'cancelled' ? 'Cancelled' : h.held ? 'Held' : 'Upcoming'), label: 'Meeting status' },
      { value: (h) => statusLabel(h.status), label: 'Attendance' },
      { key: 'notes', label: 'Notes' },
    ]);
  }

  return (
    <>
      <PageHeader
        breadcrumb={<Link to="/participants">Participants</Link>}
        title={
          <span className="title-with-avatar">
            <Avatar person={p} size={44} />
            <span>
              {fullName(p)} {p.is_sample ? <SampleTag /> : null}
              <span className="title-sub">{p.position}</span>
            </span>
          </span>
        }
        actions={
          <>
            <button className="btn" onClick={exportHistory} disabled={!history.length}><Download size={16} /> Export history</button>
            <Link to={`/participants/${p.id}/edit`} className="btn"><Pencil size={16} /> Edit</Link>
            <button className="btn btn-danger-outline" onClick={remove}><Trash2 size={16} /> Delete</button>
          </>
        }
      />

      <div className="profile-grid">
        <Panel title="Personal information" className="profile-info">
          <dl className="details">
            <dt>Status</dt>
            <dd><span className={`badge badge-p-${p.status}`}>{p.status === 'active' ? 'Active' : 'Inactive'}</span></dd>
            <dt>Email</dt>
            <dd><a href={`mailto:${p.email}`} className="icon-text"><Mail size={14} /> {p.email}</a></dd>
            <dt>Phone</dt>
            <dd>{p.phone ? <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="icon-text"><Phone size={14} /> {p.phone}</a> : <span className="muted">Not provided</span>}</dd>
            <dt>Date of birth</dt>
            <dd>{p.date_of_birth ? <>{formatDate(p.date_of_birth, { day: 'numeric', month: 'long', year: 'numeric' })} <span className="muted">({age(p.date_of_birth)})</span></> : <span className="muted">Not provided</span>}</dd>
            <dt>Position</dt>
            <dd>{p.position}</dd>
            <dt>Date joined</dt>
            <dd>{formatDate(p.date_joined, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            <dt>Notes</dt>
            <dd className="pre">{p.notes || <span className="muted">—</span>}</dd>
          </dl>
        </Panel>

        <div className="stack">
          <div className="kpis kpis-5">
            <div className="kpi"><span className="kpi-label">Meetings invited</span><span className="kpi-value">{summary.invited}</span><span className="kpi-sub">Held meetings</span></div>
            <div className="kpi"><span className="kpi-label">Attended</span><span className="kpi-value">{summary.attended}</span><span className="kpi-sub">Incl. late / online</span></div>
            <div className="kpi"><span className="kpi-label">Absences</span><span className="kpi-value">{summary.absent}</span><span className="kpi-sub">Without apology</span></div>
            <div className="kpi"><span className="kpi-label">Apologies</span><span className="kpi-value">{summary.apology}</span><span className="kpi-sub">Received</span></div>
            <div className="kpi"><span className="kpi-label">Attendance rate</span><span className="kpi-value">{formatRate(summary.rate)}</span><span className="kpi-sub">{summary.unrecorded ? `${summary.unrecorded} not recorded` : 'Of recorded meetings'}</span></div>
          </div>

          <Panel title="Attendance trend">
            <RateLineChart points={chart.points} height={200} emptyText="No attendance has been recorded for this participant yet." />
            {chart.strip.length > 0 && (
              <div className="trend-foot">
                <span className="muted small">Each square is a meeting (oldest → newest). Line shows the rolling rate over the last four meetings.</span>
                <AttendanceStrip items={chart.strip} />
              </div>
            )}
            {summary.invited > 0 && <StatusBreakdown summary={summary} />}
          </Panel>
        </div>
      </div>

      {upcoming.length > 0 && (
        <Panel title="Upcoming meetings" flush>
          <HistoryTable rows={upcoming} />
        </Panel>
      )}

      <Panel title="Attendance history" flush>
        {history.filter((h) => h.held || h.meeting_status === 'cancelled').length === 0 ? (
          <EmptyState title="No meeting history yet">Attendance will appear here once this participant is invited to a meeting that has been held.</EmptyState>
        ) : (
          <HistoryTable rows={history.filter((h) => h.held || h.meeting_status === 'cancelled')} />
        )}
      </Panel>
    </>
  );
}

function HistoryTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Meeting</th>
            <th className="hide-md">Time</th>
            <th>Attendance</th>
            <th className="hide-sm">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.meeting_id} className={h.meeting_status === 'cancelled' ? 'row-inactive' : ''}>
              <td className="nowrap">{formatDate(h.date)}</td>
              <td><Link to={`/meetings/${h.meeting_id}`} className="cell-link">{h.title}</Link></td>
              <td className="hide-md nowrap muted">{formatTimeRange(h.start_time, h.end_time)}</td>
              <td>{h.meeting_status === 'cancelled' ? <MeetingStatusBadge status="cancelled" /> : h.held || h.status ? <AttendanceBadge status={h.status} /> : <span className="muted small">Invited</span>}</td>
              <td className="hide-sm muted">{h.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
