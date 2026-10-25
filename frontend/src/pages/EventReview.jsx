import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, LineChart, AlertCircle } from "lucide-react";
import { useApi, useFetch, errMsg } from "../lib/api";
import { DIRECTION, END_REASON, SETTING_LABELS, fmtDur, fmtTs, pct } from "../lib/format";
import { Button } from "../components/ui/button";
import { Loading, ErrorBox, Stat } from "../components/StateViews";
import { SectionRule } from "../components/Micro";
import { BriefCard } from "../components/BriefCard";
import { ReviewPanel } from "../components/ReviewPanel";
import { DirIcon } from "../components/EventList";

const StatsTable = ({ e }) => {
  const b = e.baseline, o = e.observed;
  const rows = [
    ["Median (mg/dL)", b.median, o.median],
    ["MAD (mg/dL)", b.mad, "—"],
    ["Band (mg/dL)", `${b.lower} – ${b.upper}`, `range ${o.min} – ${o.max}`],
    ["Mean (mg/dL)", "—", o.mean],
    ["Readings", b.n_baseline, o.n_readings],
    ["Coverage", pct(b.coverage), "—"],
    ["Window", `${fmtTs(b.window_start)} → ${fmtTs(b.window_end)}`, `${fmtTs(e.start)} → ${fmtTs(e.end)}`],
  ];
  return (
    <div className="panel overflow-x-auto">
      <h2 className="text-lg font-semibold px-5 pt-4">Baseline vs observed</h2>
      <table className="w-full text-sm mt-2" data-testid="stats-table">
        <thead className="text-left"><tr className="eyebrow"><th className="px-5 py-2">Statistic</th><th className="px-5 py-2">Personal baseline (before)</th><th className="px-5 py-2 text-[var(--amber)]">Observed during change</th></tr></thead>
        <tbody>{rows.map(([k, a, c]) => (<tr key={k} className="border-t border-[var(--line)]"><td className="px-5 py-2.5 text-muted-foreground">{k}</td><td className="px-5 py-2.5 mono">{a}</td><td className="px-5 py-2.5 mono font-semibold">{c}</td></tr>))}</tbody>
      </table>
    </div>
  );
};

const Readings = ({ readings }) => (
  <div className="panel max-h-[360px] overflow-auto">
    <table className="w-full text-xs mono min-w-[560px]" data-testid="supporting-readings-table">
      <thead className="bg-card text-left sticky top-0"><tr className="eyebrow font-sans"><th className="px-3 py-2">Time (as recorded)</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Band at reading</th><th className="px-3 py-2">Baseline n</th><th className="px-3 py-2">Measurement ID</th></tr></thead>
      <tbody>{readings.map((r) => (
        <tr key={r.id} className="border-t border-[var(--line)]"><td className="px-3 py-1.5">{fmtTs(r.ts)}</td><td className="px-3 py-1.5 text-[var(--amber)] font-semibold">{r.value} {r.unit}</td>
          <td className="px-3 py-1.5">{r.lower}–{r.upper}</td><td className="px-3 py-1.5">{r.n_baseline}</td><td className="px-3 py-1.5 text-muted-foreground"><code>{r.id}</code></td></tr>
      ))}</tbody>
    </table>
  </div>
);

const Settings = ({ d }) => (
  <div className="panel p-5 text-sm space-y-2" data-testid="event-detector-settings">
    <h2 className="text-sm font-semibold">Detector <span className="font-normal text-muted-foreground">· unvalidated demonstration settings</span></h2>
    <div className="text-xs"><code>{d.version}</code></div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {Object.entries(d.settings).map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground">{SETTING_LABELS[k]?.[0] || k}</dt><dd className="mono">{v}</dd></div>))}
    </dl>
  </div>
);

export default function EventReview() {
  const { eid } = useParams();
  const api = useApi();
  const { data, error, loading, reload } = useFetch(`/events/${eid}`);
  const [brief, setBrief] = useState({ summary: null, loading: false, error: null });

  const generate = useCallback(async (force = false) => {
    setBrief((b) => ({ ...b, loading: true, error: null }));
    try {
      const { data: s } = await api.post(`/events/${eid}/brief`, null, { params: { force } });
      setBrief({ summary: s, loading: false, error: null });
    } catch (e) {
      setBrief({ summary: null, loading: false, error: errMsg(e) });
    }
  }, [api, eid]);

  useEffect(() => {
    if (!data) return;
    if (data.summary) setBrief({ summary: { ...data.summary, cached: true }, loading: false, error: null });
    else generate(false);
  }, [data, generate]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const e = data.event;

  return (
    <div className="space-y-6">
      <Link to={`/patients/${e.patient_id}`} className="text-sm text-muted-foreground inline-flex items-center hover:text-foreground rounded" data-testid="back-to-patient"><ChevronLeft className="h-4 w-4" />Participant {e.patient_id}</Link>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="pill tag-change"><AlertCircle className="h-3.5 w-3.5" aria-hidden />Change for review</span>
            {!e.active && <span className="pill bg-secondary text-foreground" data-testid="event-superseded">No longer detected with current settings</span>}
          </div>
          <h1 className="display text-4xl sm:text-5xl mt-3 flex items-center gap-3"><DirIcon d={e.direction} className="h-8 w-8 shrink-0" /><span data-testid="event-direction">{DIRECTION[e.direction]}</span></h1>
          <p className="text-sm text-muted-foreground mt-2">Participant <span className="mono font-semibold text-foreground">{e.patient_id}</span> · {data.data_label} · glucose, mg/dL</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-4 items-end">
          <div className="min-w-0"><div className="eyebrow">Duration</div><div className="figure text-5xl text-[var(--amber)] mt-1" data-testid="event-duration">{fmtDur(e.duration_minutes)}</div><div className="text-xs text-muted-foreground mt-1">{END_REASON[e.end_reason]}</div></div>
          <Stat label="Start" value={fmtTs(e.start)} testid="event-start" />
          <Stat label="Peak deviation" value={`${e.observed.peak_deviation_from_baseline_median > 0 ? "+" : ""}${e.observed.peak_deviation_from_baseline_median} mg/dL`} sub={`at ${fmtTs(e.observed.peak_ts)}`} testid="event-peak" />
        </div>
      </div>
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <SectionRule index="04" label="Evidence" meta={`evidence v${e.evidence_version}`} testid="evidence-rule" />
          <BriefCard summary={brief.summary} loading={brief.loading} error={brief.error} onRetry={() => generate(true)} readings={data.readings} />
          <StatsTable e={e} />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Supporting readings <span className="font-normal text-muted-foreground">({data.readings.length})</span></h2>
              <Button asChild size="sm" variant="outline" data-testid="view-on-chart"><Link to={`/patients/${e.patient_id}?event=${e.id}`}><LineChart className="h-4 w-4 mr-1" />View on chart</Link></Button></div>
            <Readings readings={data.readings} />
            {data.gaps.length > 0 && <p className="text-xs text-muted-foreground" data-testid="event-gaps">{data.gaps.length} data gap(s) in the baseline window and event: {data.gaps.slice(0, 4).map((g) => `${fmtTs(g.start)} (${fmtDur(g.minutes)})`).join(", ")}</p>}
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24">
          <SectionRule index="05" label="Review" meta="human decision" testid="review-rule" />
          <ReviewPanel eventId={e.id} initial={data.review} ended={e.end_reason !== "ongoing_at_end_of_data"} evidenceVersion={e.evidence_version} />
          <Settings d={e.detector} />
        </aside>
      </div>
    </div>
  );
}
