import { useEffect, useRef, useState } from 'react';
import { formatPoints } from './format';

export const PALETTE = ['#7b3fa0', '#1f77b4', '#d62728', '#2ca02c', '#ff7f0e', '#17becf', '#e377c2', '#8c564b', '#bcbd22', '#6b7280'];

export interface Series {
  id: string;
  name: string;
  color: string;
  values: (number | null)[];
}

interface Props {
  dates: string[];
  series: Series[];
  view: 'points' | 'rank';
  reference?: { label: string; values: (number | null)[] };
}

const WIDE = 720;
const HEIGHT = 340;
/** Below this width (in CSS pixels) the end labels are dropped: the legend and week panel name the lines. */
const NARROW = 520;
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const long = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

/** A path through the points, broken where a value is missing. */
function linePath(xs: number[], ys: (number | null)[]): string {
  let d = '';
  let pen = false;
  ys.forEach((y, i) => {
    if (y === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${xs[i]!.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

const niceStep = (max: number) => [250, 500, 1000, 2000, 5000].find((s) => max / s <= 6) ?? 10000;

/** Race points or positions over the published weeks, one line per player. Dates are spaced by time. */
export function RaceChart({ dates, series, view, reference }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  // Drawn at its real width, so text keeps its size on a phone. The first render (and the prerender) uses WIDE.
  const [W, setW] = useState(WIDE);
  const figure = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = figure.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? WIDE);
      if (width > 0) setW(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  if (dates.length === 0) return null;
  const narrow = W < NARROW;
  const H = narrow ? 280 : HEIGHT;
  const PAD = { left: narrow ? 40 : 52, right: narrow ? 10 : 130, top: 16, bottom: 28 };
  const first = day(dates[0]!);
  const span = Math.max(1, day(dates.at(-1)!) - first);
  const xs = dates.map((d) => PAD.left + ((day(d) - first) / span) * (W - PAD.left - PAD.right));
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const ref = view === 'points' ? reference : undefined;
  const refValues = ref?.values.filter((v): v is number => v !== null) ?? [];
  const top = view === 'points' ? 0 : 1;
  const bottom = view === 'points' ? Math.max(1, ...all, ...refValues) : Math.max(10, ...all);
  // Points rise upward; position 1 is at the top.
  const y = (v: number) =>
    view === 'points'
      ? PAD.top + (1 - v / bottom) * (H - PAD.top - PAD.bottom)
      : PAD.top + ((v - top) / Math.max(1, bottom - top)) * (H - PAD.top - PAD.bottom);
  const ticks = view === 'points'
    ? Array.from({ length: Math.floor(bottom / niceStep(bottom)) + 1 }, (_, i) => i * niceStep(bottom))
    : [1, ...Array.from({ length: Math.floor(bottom / 5) }, (_, i) => (i + 1) * 5)].filter((t) => t <= bottom);
  // The first week of each month, skipping any label that would crowd the one before it.
  const months: { d: string; i: number }[] = [];
  dates.forEach((d, i) => {
    const newMonth = i === 0 || d.slice(0, 7) !== dates[i - 1]!.slice(0, 7);
    if (newMonth && (months.length === 0 || xs[i]! - xs[months.at(-1)!.i]! >= 30)) months.push({ d, i });
  });
  // End labels (players and the reference line), nudged apart so they don't overlap. Dropped on narrow screens.
  const labels = [
    ...series.map((s) => {
      const last = s.values.reduce<number>((at, v, i) => (v !== null ? i : at), -1);
      return last < 0 ? null : { key: s.id, text: s.name, color: s.color as string | undefined, className: 'end-label', y: y(s.values[last]!) };
    }),
    ...(ref && refValues.length ? [{ key: 'reference', text: ref.label, color: undefined, className: 'reference-label', y: y(refValues.at(-1)!) }] : []),
  ]
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 13);
  // Each week's tap target runs halfway to its neighbours, so targets tile without overlapping.
  const edges = xs.map((x, i) => (i === 0 ? x - (xs.length > 1 ? (xs[1]! - x) / 2 : 8) : (xs[i - 1]! + x) / 2));
  const lastEdge = xs.length > 1 ? xs.at(-1)! + (xs.at(-1)! - xs.at(-2)!) / 2 : xs[0]! + 8;
  const strip = (i: number) => ({ left: `${(edges[i]! / W) * 100}%`, width: `${(((edges[i + 1] ?? lastEdge) - edges[i]!) / W) * 100}%` });
  const show = (v: number | null) => (v === null ? '—' : view === 'points' ? formatPoints(v) : `#${v}`);
  return (
    <figure className="race-chart" ref={figure}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Race ${view === 'points' ? 'points' : 'positions'} by week`}>
        {view === 'rank' && bottom >= 8 && (
          <rect className="qualifying-band" x={PAD.left} y={y(1) - 4} width={W - PAD.left - PAD.right} height={y(8) - y(1) + 8} />
        )}
        {ticks.map((t) => (
          <g key={t} className="tick">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{view === 'points' ? formatPoints(t) : t}</text>
          </g>
        ))}
        {months.map(({ d, i }) => (
          <text key={d} className="month" x={xs[i]} y={H - 8} textAnchor="middle">{monthName.format(new Date(`${d}T00:00:00Z`))}</text>
        ))}
        {ref && (
          <>
            <path className="reference" d={linePath(xs, ref.values.map((v) => (v === null ? null : y(v))))} />
          </>
        )}
        {series.map((s) => (
          <g key={s.id}>
            <path className="series" data-id={s.id} d={linePath(xs, s.values.map((v) => (v === null ? null : y(v))))} stroke={s.color} />
            {s.values.map((v, i) => (v === null ? null : <circle key={i} className="point" cx={xs[i]} cy={y(v)} r={selected === i ? 4 : 2} fill={s.color} />))}
          </g>
        ))}
        {!narrow &&
          labels.map((l) => (
            <text key={l.key} className={l.className} x={W - PAD.right + 4} y={l.y + 4} fill={l.color}>{l.text}</text>
          ))}
        {selected !== null && <line className="cursor" x1={xs[selected]} x2={xs[selected]} y1={PAD.top} y2={H - PAD.bottom} />}
      </svg>
      <div className="weeks">
        {dates.map((d, i) => (
          <button
            key={d}
            type="button"
            className="week"
            style={strip(i)}
            aria-label={`Week of ${long.format(new Date(`${d}T00:00:00Z`))}`}
            aria-pressed={selected === i}
            onClick={() => setSelected(selected === i ? null : i)}
            onMouseEnter={() => setSelected(i)}
          />
        ))}
      </div>
      {selected !== null && (
        <div className="chart-tip" role="status">
          <strong>{long.format(new Date(`${dates[selected]}T00:00:00Z`))}</strong>
          <ul>
            {series.map((s) => (
              <li key={s.id}>
                <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                {`${s.name}: ${show(s.values[selected] ?? null)}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
