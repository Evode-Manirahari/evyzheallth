import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMs, makeTicks, toMs } from "../lib/format";
import { CHART_MARGIN, GapNote } from "./GlucoseChart";

const MAX_POINTS = 1500;
const MIN = 60000;

// Merge 1-minute aggregates into wider bins only for display; counts/min/max stay exact.
function bin(rows, range) {
  const width = Math.max(MIN, Math.ceil((range[1] - range[0]) / MAX_POINTS / MIN) * MIN);
  if (width === MIN) return rows.map((r) => ({ ...r, minutes: 1 }));
  const out = new Map();
  for (const r of rows) {
    const k = Math.floor((r.x - range[0]) / width);
    const b = out.get(k);
    if (!b) out.set(k, { x: r.x, sum: r.mean * r.count, min: r.min, max: r.max, count: r.count, minutes: 1 });
    else {
      b.sum += r.mean * r.count;
      b.min = Math.min(b.min, r.min);
      b.max = Math.max(b.max, r.max);
      b.count += r.count;
      b.minutes += 1;
    }
  }
  return [...out.values()].map((b) => ({ x: b.x, mean: +(b.sum / b.count).toFixed(2), min: b.min, max: b.max, count: b.count, minutes: b.minutes }));
}

const Tip = ({ active, payload, unit }) => {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  if (p.gap) return <GapNote gap={p.gap} />;
  if (p.mean == null) return null;
  return (
    <div className="panel p-3 text-xs space-y-1 shadow-sm">
      <div className="mono">{fmtMs(p.x)}{p.minutes > 1 ? ` · ${p.minutes} one-minute summaries` : " · 1-minute summary"}</div>
      <div>Mean <span className="mono font-semibold">{p.mean}</span> {unit}</div>
      <div className="text-muted-foreground">Range {p.min}–{p.max} {unit} · {p.count} samples</div>
    </div>
  );
};

export const ContextChart = ({ series, range, color, testid, focused, tickCount = 7 }) => {
  const data = useMemo(() => {
    const visible = series.points.filter((p) => { const x = toMs(p.ts); return x >= range[0] && x <= range[1]; })
      .map((p) => ({ ...p, x: toMs(p.ts) }));
    const rows = bin(visible, range).map((r) => ({ ...r, band: [r.min, r.max] }));
    for (const g of series.gaps) {
      const x = (toMs(g.start) + toMs(g.end)) / 2;
      if (x >= range[0] && x <= range[1]) rows.push({ x, mean: null, band: null, gap: g });
    }
    return rows.sort((a, b) => a.x - b.x);
  }, [series, range]);
  const gaps = series.gaps.filter((g) => toMs(g.end) >= range[0] && toMs(g.start) <= range[1]);
  const label = `${series.label} (${series.unit}${series.unit_status === "unverified" ? ", unverified" : ""})`;
  const hasData = data.some((r) => r.mean != null);
  const yDomain = hasData ? ["auto", "auto"] : [Math.floor(Math.min(...series.points.map((p) => p.min))), Math.ceil(Math.max(...series.points.map((p) => p.max)))];

  return (
    <div className="h-[200px] w-full relative" data-testid={testid} role="img" aria-label={`${label}, one-minute mean with min–max range`}>
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" data-testid={`${testid}-no-data`}>
          <span className="panel px-3 py-1.5 text-xs text-muted-foreground">No {series.label.toLowerCase()} data in this range{gaps[0] ? ` — missing ${fmtMs(toMs(gaps[0].start))} → ${fmtMs(toMs(gaps[0].end))}` : ""}</span>
        </div>
      )}
      <ResponsiveContainer>
        <ComposedChart data={data} syncId="evyz-timeline" syncMethod="value" margin={CHART_MARGIN}>
          <CartesianGrid stroke="#ebe8e1" vertical={false} />
          <XAxis dataKey="x" type="number" scale="time" domain={range} ticks={makeTicks(range, tickCount)} interval={0} tickFormatter={(v) => fmtMs(v, false)} tick={{ fontSize: 11, fill: "#475569" }} allowDataOverflow />
          <YAxis tick={{ fontSize: 11, fill: "#475569" }} width={56} domain={yDomain} allowDataOverflow
            label={{ value: label, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569", textAnchor: "middle" }, dy: 40 }} />
          {gaps.map((g) => (
            <ReferenceArea key={g.start} x1={Math.max(toMs(g.start), range[0])} x2={Math.min(toMs(g.end), range[1])} fill="#94a3b8" fillOpacity={0.18} ifOverflow="hidden" />
          ))}
          {focused && (
            <ReferenceArea x1={toMs(focused.start)} x2={Math.max(toMs(focused.end), toMs(focused.start) + 60000)} fill="#f59e0b" fillOpacity={0.16} stroke="#b45309" strokeDasharray="3 3" ifOverflow="hidden" />
          )}
          <Area dataKey="band" stroke="none" fill={color} fillOpacity={0.15} isAnimationActive={false} connectNulls={false} activeDot={false} />
          <Line dataKey="mean" stroke={color} strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Tooltip content={<Tip unit={series.unit} />} filterNull={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
