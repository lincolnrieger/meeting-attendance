/**
 * Lightweight SVG charts (no charting library needed).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { statusLabel } from '../lib/attendance';
import { formatDate } from '../lib/format';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Percentage line chart (0–100%).
 * points: [{ label, value, tooltip }]  — value may be null (gap).
 */
export function RateLineChart({ points, height = 220, emptyText = 'Not enough data to chart yet.' }) {
  const [ref, width] = useWidth();
  if (!points.length || points.every((p) => p.value == null)) {
    return (
      <div className="chart" ref={ref}>
        <div className="chart-empty">{emptyText}</div>
      </div>
    );
  }
  const pad = { top: 14, right: 12, bottom: 28, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v) => pad.top + h - (v / 100) * h;

  // Build path segments, breaking on null values.
  let d = '';
  let pen = false;
  points.forEach((p, i) => {
    if (p.value == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `;
    pen = true;
  });

  const maxLabels = Math.max(2, Math.floor(w / 64));
  const step = Math.ceil(points.length / maxLabels);

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Attendance rate over time">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={pad.left + w} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'grid'} />
            <text x={pad.left - 8} y={y(v) + 4} textAnchor="end" className="tick">{v}%</text>
          </g>
        ))}
        {points.map((p, i) =>
          (i % step === 0 && points.length - 1 - i >= step / 2) || i === points.length - 1 ? (
            <text key={`l${i}`} x={x(i)} y={height - 8} textAnchor={points.length > 1 && i === points.length - 1 ? 'end' : i === 0 && points.length > 1 ? 'start' : 'middle'} className="tick">{p.label}</text>
          ) : null,
        )}
        <path d={d} className="line" />
        {points.map((p, i) =>
          p.value == null ? null : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} className="point">
              <title>{p.tooltip || `${p.label}: ${p.value}%`}</title>
            </circle>
          ),
        )}
      </svg>
    </div>
  );
}

/** One square per meeting, coloured by attendance status, oldest → newest. */
export function AttendanceStrip({ items }) {
  if (!items.length) return null;
  return (
    <div className="strip" aria-label="Attendance per meeting, oldest to newest">
      {items.map((it) => (
        <Link
          key={it.meeting_id}
          to={`/meetings/${it.meeting_id}`}
          className={`strip-cell seg-${it.status || 'unrecorded'}`}
          title={`${formatDate(it.date)} · ${it.title} — ${statusLabel(it.status)}`}
        />
      ))}
    </div>
  );
}
