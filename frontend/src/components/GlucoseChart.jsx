import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMs, makeTicks, toMs } from "../lib/format";

export const CHART_MARGIN = { top: 10, right: 40, bottom: 4, left: 4 };

const FlagDot = ({ cx, cy, payload }) =>
  payload?.flag && cx != null && cy != null ? <circle cx={cx} cy={cy} r={2.6} fill="#d97706" stroke="#92400e" strokeWidth={0.6} /> : <g />;

export const GapNote = ({ gap }) => (
  <div className="panel p-3 text-xs space-y-1 shadow-sm" data-testid="tooltip-gap">
    <div className="font-medium">Missing data</div>
    <div className="mono">{fmtMs(toMs(gap.start))} → {fmtMs(toMs(gap.end))}</div>
    <div className="text-muted-foreground">{gap.minutes} min without readings</div>
  </div>
);

const Tip = ({ active, payload }) => {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  if (p.gap) return <GapNote gap={p.gap} />;
  if (p.value == null) return null;
  return (
    <div className="panel p-3 text-xs space-y-1 shadow-sm">
      <div className="mono">{fmtMs(p.x)}</div>
      <div><span className="mono font-semibold">{p.value}</span> mg/dL <span className="text-muted-foreground">· 1 reading</span></div>
      {p.status === "insufficient_history" ? <div className="text-muted-foreground">Insufficient history for baseline</div> : (
        <div className="text-muted-foreground">Baseline median {p.median} · band {p.band?.[0]}–{p.band?.[1]}</div>
      )}
      {p.flag && <div className="text-amber-800 font-medium">Outside band ({p.flag === "high" ? "above" : "below"})</div>}
    </div>
  );
};

export const GlucoseChart = ({ points, gaps, events, range, focusId, tickCount = 7 }) => {
  const data = useMemo(() => {
    const gapByStart = Object.fromEntries(gaps.map((g) => [g.start, g]));
    const rows = [];
    for (const p of points) {
      const x = toMs(p.ts);
      if (x < range[0] || x > range[1]) continue;
      rows.push({ x, value: p.value, band: p.lower != null ? [p.lower, p.upper] : null, median: p.median, flag: p.flag, status: p.status });
      const g = gapByStart[p.ts];
      if (g) rows.push({ x: (toMs(g.start) + toMs(g.end)) / 2, value: null, band: null, gap: g });
    }
    return rows;
  }, [points, gaps, range]);

  const visibleGaps = gaps.filter((g) => toMs(g.end) >= range[0] && toMs(g.start) <= range[1]);
  const visibleEvents = events.filter((e) => toMs(e.end) >= range[0] && toMs(e.start) <= range[1]);

  return (
    <div className="h-[360px] w-full" data-testid="glucose-chart" role="img" aria-label="Glucose readings with personal baseline band, gaps and change markers">
      <ResponsiveContainer>
        <ComposedChart data={data} syncId="evyz-timeline" syncMethod="value" margin={CHART_MARGIN}>
          <CartesianGrid stroke="#ebe8e1" vertical={false} />
          <XAxis dataKey="x" type="number" scale="time" domain={range} ticks={makeTicks(range, tickCount)} interval={0} tickFormatter={(v) => fmtMs(v, false)} tick={{ fontSize: 11, fill: "#475569" }} allowDataOverflow />
          <YAxis tick={{ fontSize: 11, fill: "#475569" }} width={56} domain={["auto", "auto"]}
            label={{ value: "Glucose (mg/dL)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#475569" } }} />
          {visibleGaps.map((g) => (
            <ReferenceArea key={`gap-${g.start}`} x1={Math.max(toMs(g.start), range[0])} x2={Math.min(toMs(g.end), range[1])} fill="#94a3b8" fillOpacity={0.18} ifOverflow="hidden" />
          ))}
          {visibleEvents.map((e) => (
            <ReferenceArea key={e.id} x1={toMs(e.start)} x2={Math.max(toMs(e.end), toMs(e.start) + 60000)} fill="#f59e0b"
              fillOpacity={e.id === focusId ? 0.32 : 0.14} stroke={e.id === focusId ? "#b45309" : "none"} ifOverflow="hidden" />
          ))}
          <Area dataKey="band" stroke="none" fill="#0f766e" fillOpacity={0.13} isAnimationActive={false} connectNulls={false} activeDot={false} />
          <Line dataKey="median" stroke="#0f766e" strokeOpacity={0.5} strokeDasharray="4 3" dot={false} strokeWidth={1} isAnimationActive={false} connectNulls={false} activeDot={false} />
          <Line dataKey="value" stroke="#162a4a" strokeWidth={1.4} dot={<FlagDot />} isAnimationActive={false} connectNulls={false} />
          <Tooltip content={<Tip />} filterNull={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const ChartLegend = () => (
  <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" data-testid="chart-legend">
    <span className="flex items-center gap-1.5"><i className="w-4 h-0.5 bg-[var(--navy)] inline-block" />Glucose reading (mg/dL)</span>
    <span className="flex items-center gap-1.5"><i className="w-4 h-3 bg-[#0f766e]/20 inline-block" />Personal baseline band · dashed = median</span>
    <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />Reading outside band</span>
    <span className="flex items-center gap-1.5"><i className="w-4 h-3 bg-amber-400/40 inline-block" />Change for review</span>
    <span className="flex items-center gap-1.5"><i className="w-4 h-3 bg-slate-400/30 inline-block" />Missing data (gap &gt; 2× cadence)</span>
    <span>No band = insufficient history</span>
  </div>
);
