/** Reports and statistics with date-range filtering and CSV export. */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, BarChart3, Download } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { qs } from '../lib/api';
import { formatRate } from '../lib/attendance';
import { downloadCSV } from '../lib/csv';
import { formatDate, formatMonth, shiftISO, todayISO } from '../lib/format';
import { EmptyState, ErrorNotice, Loading, PageHeader, Panel, RateBar, StatusBreakdown } from '../components/ui';
import { RateLineChart } from '../components/Charts';

const PRESETS = {
  '3m': { label: 'Last 3 months', range: () => ({ from: shiftISO(todayISO(), { months: -3 }), to: todayISO() }) },
  '12m': { label: 'Last 12 months', range: () => ({ from: shiftISO(todayISO(), { months: -12 }), to: todayISO() }) },
  ytd: { label: 'This calendar year', range: () => ({ from: `${todayISO().slice(0, 4)}-01-01`, to: todayISO() }) },
  ly: { label: 'Last calendar year', range: () => { const y = Number(todayISO().slice(0, 4)) - 1; return { from: `${y}-01-01`, to: `${y}-12-31` }; } },
  fy: { label: 'This financial year', range: () => { const t = todayISO(); const y = Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 7 ? 1 : 0); return { from: `${y}-07-01`, to: t }; } },
  all: { label: 'All time', range: () => ({ from: '', to: '' }) },
  custom: { label: 'Custom range' },
};

const STAT_COLS = [
  { key: 'invited', label: 'Invited' },
  { key: 'attended', label: 'Attended' },
  { key: 'present', label: 'Present', hide: 'hide-lg' },
  { key: 'late', label: 'Late', hide: 'hide-lg' },
  { key: 'left_early', label: 'Left early', hide: 'hide-lg' },
  { key: 'online', label: 'Online', hide: 'hide-lg' },
  { key: 'apology', label: 'Apologies' },
  { key: 'absent', label: 'Absent' },
  { key: 'unrecorded', label: 'Not rec.', hide: 'hide-md' },
];

const CSV_STATS = [
  { key: 'invited', label: 'Invited' }, { key: 'recorded', label: 'Recorded' }, { key: 'attended', label: 'Attended' },
  { key: 'present', label: 'Present' }, { key: 'late', label: 'Late' }, { key: 'left_early', label: 'Left early' },
  { key: 'online', label: 'Online' }, { key: 'apology', label: 'Apology received' }, { key: 'absent', label: 'Absent' },
  { key: 'unrecorded', label: 'Not recorded' }, { value: (r) => r.rate ?? '', label: 'Attendance %' },
];

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const preset = params.get('range') || '12m';
  const tab = params.get('view') || 'overview';
  const range = preset === 'custom' ? { from: params.get('from') || '', to: params.get('to') || '' } : PRESETS[preset].range();
  const { data, error, loading } = useApi(`/reports${qs(range)}`);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const rangeLabel = range.from || range.to ? `${range.from ? formatDate(range.from) : 'Start'} – ${range.to ? formatDate(range.to) : 'today'}` : 'All time';
  const fileSuffix = `${range.from || 'start'}-to-${range.to || 'now'}`;

  return (
    <>
      <PageHeader title="Reports" subtitle={`Attendance statistics for meetings held · ${rangeLabel}`} />

      <div className="toolbar report-filters">
        <div className="field-inline">
          <label htmlFor="preset">Period</label>
          <select id="preset" className="input" value={preset} onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') update({ range: 'custom', from: range.from, to: range.to });
            else update({ range: v === '12m' ? '' : v, from: '', to: '' });
          }}>
            {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </div>
        <div className="field-inline">
          <label htmlFor="from">From</label>
          <input id="from" type="date" className="input" value={range.from} onChange={(e) => update({ range: 'custom', from: e.target.value, to: range.to })} />
        </div>
        <div className="field-inline">
          <label htmlFor="to">To</label>
          <input id="to" type="date" className="input" value={range.to} onChange={(e) => update({ range: 'custom', from: range.from, to: e.target.value })} />
        </div>
        <div className="tabs ml-auto" role="tablist">
          {[['overview', 'Overview'], ['members', 'By member'], ['meetings', 'By meeting']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => update({ view: k === 'overview' ? '' : k })}>{l}</button>
          ))}
        </div>
      </div>

      <ErrorNotice error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data ? null : data.summary.meetings === 0 ? (
        <div className="panel"><EmptyState icon={BarChart3} title="No meetings were held in this period">Try a wider date range.</EmptyState></div>
      ) : tab === 'members' ? (
        <MemberReport rows={data.byMember} fileSuffix={fileSuffix} />
      ) : tab === 'meetings' ? (
        <MeetingReport rows={data.byMeeting} fileSuffix={fileSuffix} />
      ) : (
        <Overview data={data} fileSuffix={fileSuffix} />
      )}
    </>
  );
}

function Overview({ data, fileSuffix }) {
  const { summary, trend, byMember } = data;
  const ranked = byMember.filter((m) => m.recorded >= 2 && m.rate != null);
  const top = [...ranked].sort((a, b) => b.rate - a.rate || b.attended - a.attended).slice(0, 5);
  const bottom = [...ranked].sort((a, b) => a.rate - b.rate || a.attended - b.attended).slice(0, 5);
  const pctOf = (n) => (summary.recorded ? `${Math.round((n / summary.recorded) * 1000) / 10}%` : '—');

  function exportOverview() {
    downloadCSV(`attendance-summary-${fileSuffix}.csv`, [
      { metric: 'Meetings held', value: summary.meetings },
      { metric: 'Meetings cancelled', value: summary.cancelled },
      ...CSV_STATS.map((c) => ({ metric: c.label, value: c.value ? c.value(summary) : summary[c.key] })),
    ], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }]);
  }

  function exportTrend() {
    downloadCSV(`attendance-trend-${fileSuffix}.csv`, trend, [{ key: 'month', label: 'Month' }, { key: 'meetings', label: 'Meetings' }, ...CSV_STATS]);
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Meetings held</span><span className="kpi-value">{summary.meetings}</span><span className="kpi-sub">{summary.cancelled} cancelled</span></div>
        <div className="kpi"><span className="kpi-label">Overall attendance</span><span className="kpi-value">{formatRate(summary.rate)}</span><span className="kpi-sub">{summary.attended} of {summary.recorded} records</span></div>
        <div className="kpi"><span className="kpi-label">Average per meeting</span><span className="kpi-value">{(summary.attended / summary.meetings).toFixed(1)}</span><span className="kpi-sub">attendees</span></div>
        <div className="kpi"><span className="kpi-label">Apologies</span><span className="kpi-value">{summary.apology}</span><span className="kpi-sub">{pctOf(summary.apology)} of records</span></div>
        <div className="kpi"><span className="kpi-label">Absences</span><span className="kpi-value">{summary.absent}</span><span className="kpi-sub">{pctOf(summary.absent)} without apology</span></div>
        <div className="kpi"><span className="kpi-label">Not recorded</span><span className={`kpi-value ${summary.unrecorded ? 'warn' : ''}`}>{summary.unrecorded}</span><span className="kpi-sub">Outstanding entries</span></div>
      </div>

      <div className="grid-2 grid-wide-left">
        <Panel title="Attendance trend by month" actions={<button className="btn btn-sm btn-ghost" onClick={exportTrend}><Download size={15} /> CSV</button>}>
          <RateLineChart points={trend.map((t) => ({ label: formatMonth(t.month), value: t.rate, tooltip: `${formatMonth(t.month)}: ${formatRate(t.rate)} (${t.attended}/${t.recorded}, ${t.meetings} meeting${t.meetings === 1 ? '' : 's'})` }))} />
        </Panel>
        <Panel title="Absence and apology statistics" actions={<button className="btn btn-sm btn-ghost" onClick={exportOverview}><Download size={15} /> CSV</button>}>
          <StatusBreakdown summary={summary} showLegend={false} />
          <table className="table table-compact mt">
            <tbody>
              {[['Present', 'present'], ['Late', 'late'], ['Left early', 'left_early'], ['Online', 'online'], ['Apology received', 'apology'], ['Absent', 'absent'], ['Not recorded', 'unrecorded']].map(([l, k]) => (
                <tr key={k}>
                  <td><span className={`dot seg-${k}`} /> {l}</td>
                  <td className="num">{summary[k]}</td>
                  <td className="num muted">{k === 'unrecorded' ? '' : pctOf(summary[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid-2">
        <RankPanel title="Highest attendance" rows={top} />
        <RankPanel title="Lowest attendance" rows={bottom} />
      </div>
    </>
  );
}

function RankPanel({ title, rows }) {
  return (
    <Panel title={title} flush>
      {rows.length === 0 ? <EmptyState title="Not enough data" /> : (
        <table className="table">
          <thead><tr><th>Member</th><th className="num">Attended</th><th className="num hide-sm">Apol.</th><th className="num hide-sm">Absent</th><th className="rate-col">Rate</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/participants/${r.id}`} className="cell-link">{r.first_name} {r.last_name}</Link><div className="muted small">{r.position}</div></td>
                <td className="num">{r.attended} / {r.recorded}</td>
                <td className="num hide-sm">{r.apology}</td>
                <td className="num hide-sm">{r.absent}</td>
                <td className="rate-col"><span className="rate"><RateBar rate={r.rate} /> {formatRate(r.rate)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="table-foot">Members with at least two recorded meetings in the period.</div>
    </Panel>
  );
}

/** Sortable table state. */
function useSort(rows, initial) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sort.key] ?? -1;
      const vb = b[sort.key] ?? -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir;
    });
  }, [rows, sort]);
  const header = (key, label, className = '') => (
    <th className={`sortable ${className}`} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : s.key === key ? 'desc' : typeof rows[0]?.[key] === 'string' ? 'asc' : 'desc' }))}>
        {label}
        {sort.key === key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
  return [sorted, header];
}

function MemberReport({ rows, fileSuffix }) {
  const [sorted, header] = useSort(rows, { key: 'last_name', dir: 'asc' });
  const exportCSV = () => downloadCSV(`attendance-by-member-${fileSuffix}.csv`, sorted, [
    { key: 'first_name', label: 'First name' }, { key: 'last_name', label: 'Last name' }, { key: 'position', label: 'Position' },
    { key: 'email', label: 'Email' }, { key: 'participant_status', label: 'Status' }, ...CSV_STATS,
  ]);
  return (
    <Panel title={`Attendance by individual (${rows.length})`} actions={<button className="btn btn-sm" onClick={exportCSV}><Download size={15} /> Export CSV</button>} flush>
      <div className="table-wrap">
        <table className="table table-hover">
          <thead>
            <tr>
              {header('last_name', 'Member')}
              {STAT_COLS.map((c) => header(c.key, c.label, `num ${c.hide || ''}`))}
              {header('rate', 'Rate', 'rate-col')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className={r.participant_status === 'inactive' ? 'row-inactive' : ''}>
                <td><Link to={`/participants/${r.id}`} className="cell-link">{r.first_name} {r.last_name}</Link><div className="muted small">{r.position}</div></td>
                {STAT_COLS.map((c) => <td key={c.key} className={`num ${c.hide || ''} ${c.key === 'unrecorded' && r.unrecorded ? 'warn-text' : ''}`}>{r[c.key]}</td>)}
                <td className="rate-col"><span className="rate"><RateBar rate={r.rate} /> {formatRate(r.rate)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MeetingReport({ rows, fileSuffix }) {
  const [sorted, header] = useSort(rows, { key: 'date', dir: 'desc' });
  const exportCSV = () => downloadCSV(`attendance-by-meeting-${fileSuffix}.csv`, sorted, [
    { key: 'date', label: 'Date' }, { key: 'start_time', label: 'Start' }, { key: 'title', label: 'Meeting' }, { key: 'location', label: 'Location' }, ...CSV_STATS,
  ]);
  return (
    <Panel title={`Attendance by meeting (${rows.length})`} actions={<button className="btn btn-sm" onClick={exportCSV}><Download size={15} /> Export CSV</button>} flush>
      <div className="table-wrap">
        <table className="table table-hover">
          <thead>
            <tr>
              {header('date', 'Date')}
              {header('title', 'Meeting')}
              {STAT_COLS.map((c) => header(c.key, c.label, `num ${c.hide || ''}`))}
              {header('rate', 'Rate', 'rate-col')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{formatDate(r.date)}</td>
                <td><Link to={`/meetings/${r.id}`} className="cell-link">{r.title}</Link></td>
                {STAT_COLS.map((c) => <td key={c.key} className={`num ${c.hide || ''} ${c.key === 'unrecorded' && r.unrecorded ? 'warn-text' : ''}`}>{r[c.key]}</td>)}
                <td className="rate-col"><span className="rate"><RateBar rate={r.rate} /> {formatRate(r.rate)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
