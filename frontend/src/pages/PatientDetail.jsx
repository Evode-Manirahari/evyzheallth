import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useFetch } from "../lib/api";
import { fmtTs, fmtDur, pct, toMs, msToInput, inputToMs } from "../lib/format";
import { Button } from "../components/ui/button";
import { Loading, ErrorBox, Empty, Stat } from "../components/StateViews";
import { GlucoseChart, ChartLegend } from "../components/GlucoseChart";
import { ContextChart } from "../components/ContextChart";
import { EventList, EvidencePanel } from "../components/EventList";

const H = 3600 * 1000;
const PRESETS = [["All", null], ["Last 24 h", 24], ["Last 3 days", 72], ["Last 7 days", 168]];

const RangeControls = ({ full, range, setRange }) => (
  <div className="flex flex-wrap items-end gap-3" data-testid="range-controls">
    <div className="flex gap-1" role="group" aria-label="Date range presets">
      {PRESETS.map(([label, h]) => (
        <Button key={label} size="sm" variant="outline" data-testid={`range-preset-${h || "all"}`}
          onClick={() => setRange(h ? [Math.max(full[1] - h * H, full[0]), full[1]] : full)}>{label}</Button>
      ))}
    </div>
    <label className="text-xs space-y-1"><span className="eyebrow block">From</span>
      <input type="datetime-local" className="h-9 rounded-md border bg-white px-2 mono text-xs" value={msToInput(range[0])}
        onChange={(e) => { const v = inputToMs(e.target.value); if (e.target.value && v < range[1]) setRange([v, range[1]]); else if (e.target.value) toast.error("“From” must be earlier than “To”."); }} data-testid="range-from-input" /></label>
    <label className="text-xs space-y-1"><span className="eyebrow block">To</span>
      <input type="datetime-local" className="h-9 rounded-md border bg-white px-2 mono text-xs" value={msToInput(range[1])}
        onChange={(e) => { const v = inputToMs(e.target.value); if (e.target.value && v > range[0]) setRange([range[0], v]); else if (e.target.value) toast.error("“To” must be later than “From”."); }} data-testid="range-to-input" /></label>
  </div>
);

const UnitProvenance = ({ s, id }) => (
  <details className="text-xs mt-1" data-testid={`${id}-unit-provenance`}>
    <summary className="cursor-pointer">
      {s.unit_status === "documented" ? (
        <span className="inline-block rounded px-1.5 py-0.5 bg-accent text-accent-foreground" data-testid={`${id}-unit-status`}>Unit {s.unit}: documented by device vendor · not stated in file</span>
      ) : (
        <span className="inline-block rounded px-1.5 py-0.5 tag-change" data-testid={`${id}-unit-status`}>Unit unverified: {s.unit} assumed · not stated in file or official documentation</span>
      )}
    </summary>
    <div className="mt-2 space-y-1 text-muted-foreground">
      <div>{s.unit_note}</div>
      <div>Unit in file header: <span className="mono">{s.unit_in_file || "none"}</span> · Source: {s.source}</div>
      {s.documentation.map((d) => (
        <div key={d.url + d.states}>“{d.states}” — <a className="underline" href={d.url} target="_blank" rel="noreferrer">{d.source}</a></div>
      ))}
    </div>
  </details>
);

const Conflicts = ({ s, id }) =>
  s.conflicts_count > 0 ? (
    <div className="text-xs tag-change rounded p-2 mt-1" role="status" data-testid={`${id}-conflicts`}>
      {s.conflicts_count} overlapping one-minute summaries from another import differ from stored values and are flagged for review. Stored values are kept; the differing values are not displayed or counted.
      <span className="mono block mt-1">{s.conflicts.slice(0, 3).map((c) => `${c.ts.replace("T", " ").slice(0, 16)}: stored ${c.existing.mean} (n=${c.existing.count}) vs incoming ${c.incoming.mean} (n=${c.incoming.count})`).join(" · ")}</span>
    </div>
  ) : null;

const ContextSection = ({ hr, temp, range, focused, tickCount }) => {
  if (!range) return null;
  const items = [[hr, "#7c3aed", "hr-chart"], [temp, "#c2410c", "temp-chart"]];
  if (items.every(([s]) => s.data && !s.data.points.length)) return null;
  return (
    <div className="space-y-3 border-t pt-4" data-testid="context-charts">
      <div>
        <div className="eyebrow">Contextual wearable data · no change detection · same date range</div>
        <p className="text-xs text-muted-foreground mt-1">One-minute mean (line) with min–max range (shaded). No thresholds or change detection are applied to these measurements; they are context only, not evidence of a diagnosis or cause. Skin temperature is measured at the wrist surface, not core body temperature.</p>
      </div>
      {items.map(([s, color, id]) => (
        <div key={id}>
          {s.loading && <Loading label="Loading contextual data…" testid={`${id}-loading`} />}
          {s.error && <ErrorBox message={s.error} onRetry={s.reload} testid={`${id}-error`} />}
          {s.data && s.data.points.length > 0 && (
            <>
              <div className="text-sm font-medium">{s.data.label} <span className="text-muted-foreground font-normal">({s.data.unit}{s.data.unit_status === "unverified" ? ", unverified" : ""}) · {s.data.points.length} one-minute summaries · {s.data.gaps.length} gaps &gt; 2 min</span></div>
              <UnitProvenance s={s.data} id={id} />
              <Conflicts s={s.data} id={id} />
              <ContextChart series={s.data} range={range} color={color} testid={id} focused={focused} tickCount={tickCount} />
            </>
          )}
          {s.data && s.data.points.length === 0 && <div className="text-xs text-muted-foreground" data-testid={`${id}-empty`}>No {id === "hr-chart" ? "heart-rate" : "skin-temperature"} data imported for this participant.</div>}
        </div>
      ))}
    </div>
  );
};

export default function PatientDetail() {
  const { pid } = useParams();
  const [params, setParams] = useSearchParams();
  const detail = useFetch(`/patients/${encodeURIComponent(pid)}`);
  const series = useFetch(`/patients/${encodeURIComponent(pid)}/series`);
  const hr = useFetch(`/patients/${encodeURIComponent(pid)}/context/heart_rate`);
  const temp = useFetch(`/patients/${encodeURIComponent(pid)}/context/skin_temperature`);
  const [range, setRange] = useState(null);
  const prevFull = useRef(null);
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const tickCount = width < 640 ? 3 : width < 1024 ? 5 : 7;
  const focusId = params.get("event");

  const full = useMemo(() => {
    const ends = [series.data?.points, hr.data?.points, temp.data?.points].filter((p) => p?.length)
      .flatMap((p) => [toMs(p[0].ts), toMs(p[p.length - 1].ts)]);
    return ends.length ? [Math.min(...ends), Math.max(...ends)] : null;
  }, [series.data, hr.data, temp.data]);
  const focused = detail.data?.events.find((e) => e.id === focusId);

  useEffect(() => {
    if (!full) return;
    if (focused) setRange([Math.max(toMs(focused.start) - 4 * H, full[0]), Math.min(toMs(focused.end) + 4 * H, full[1])]);
    else {
      const prev = prevFull.current;
      setRange((r) => (!r || (prev && r[0] === prev[0] && r[1] === prev[1]) ? full : r));
    }
    prevFull.current = full;
  }, [full, focused]);

  if (detail.loading || series.loading) return <Loading />;
  if (detail.error || series.error) return <ErrorBox message={detail.error || series.error} onRetry={() => { detail.reload(); series.reload(); }} />;
  const p = detail.data;
  const pts = series.data.points;
  const latest = pts[pts.length - 1];
  const focus = (id) => setParams(id ? { event: id } : {});

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-muted-foreground inline-flex items-center hover:text-foreground" data-testid="back-to-overview"><ChevronLeft className="h-4 w-4" />All participants</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Participant <span className="mono" data-testid="patient-id-heading">{p.id}</span></h1>
          <span className="inline-block mt-2 text-xs rounded px-2 py-0.5 bg-secondary" data-testid="patient-data-label">{p.data_label}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <Stat label="Latest" value={latest ? `${latest.value} mg/dL` : "—"} sub={latest ? fmtTs(latest.ts) : null} testid="patient-latest" />
          <Stat label="Readings" value={pts.length} sub={`cadence ${p.cadence_seconds ? fmtDur(p.cadence_seconds / 60) : "—"}`} testid="patient-readings" />
          <Stat label="Gaps" value={series.data.gaps.length} sub="> 2× cadence" testid="patient-gaps" />
          <Stat label="Insufficient history" value={`${p.insufficient_count} / ${p.evaluated_count}`} sub="readings without baseline" testid="patient-insufficient" />
        </div>
      </div>

      {pts.length === 0 ? (
        <Empty title="No glucose readings stored" testid="patient-no-data">Import a CSV for this participant to see the timeline.</Empty>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="panel p-5 space-y-4 min-w-0">
            <div data-testid="glucose-detection-heading">
              <div className="eyebrow">Glucose · change detection applied</div>
              <p className="text-xs text-muted-foreground mt-1">Only glucose is compared with this participant's personal baseline. Changes for review and AI briefs are based on glucose alone.</p>
            </div>
            {range && <RangeControls full={full} range={range} setRange={setRange} />}
            {range && <GlucoseChart points={pts} gaps={series.data.gaps} events={p.events} range={range} focusId={focusId} tickCount={tickCount} />}
            <ChartLegend />
            <ContextSection hr={hr} temp={temp} range={range} focused={focused} tickCount={tickCount} />
            <p className="text-xs text-muted-foreground">Timestamps are shown as recorded in the source file; no timezone was supplied. Baseline: preceding {p.settings.baseline_hours} h of this participant's readings only.</p>
          </div>
          <aside className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Changes for review <span className="text-muted-foreground font-normal">({p.events.length})</span></h2>
              {focusId && <Button size="sm" variant="ghost" onClick={() => { focus(null); setRange(full); }} data-testid="clear-event-focus">Clear focus</Button>}
            </div>
            {focused && <EvidencePanel e={focused} />}
            {p.events.length === 0 ? (
              <div className="panel p-4 text-sm text-muted-foreground" data-testid="no-events-note">
                No sustained changes were detected with the current detector settings. This does not mean the participant is clinically stable or safe.
                {p.insufficient_count === p.evaluated_count && " All readings had insufficient history for a baseline."}
              </div>
            ) : (
              <EventList events={p.events} focusId={focusId} onFocus={focus} />
            )}
            <div className="text-xs text-muted-foreground">Coverage of baseline windows ≥ {pct(p.settings.min_coverage)} required.</div>
          </aside>
        </div>
      )}
    </div>
  );
}
