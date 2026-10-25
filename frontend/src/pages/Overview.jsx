import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Upload, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useFetch } from "../lib/api";
import { fmtTs, pct } from "../lib/format";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Loading, ErrorBox, Empty } from "../components/StateViews";
import { SectionRule } from "../components/Micro";

const SummaryCell = ({ p }) => {
  if (!p.events_total) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-xs text-muted-foreground">
      {p.ai_summaries} AI · {p.template_summaries} template · {p.events_total - p.ai_summaries - p.template_summaries} not generated
    </span>
  );
};

const ReviewState = ({ p }) =>
  p.unreviewed > 0 ? (
    <div>
      <span className="pill tag-change" data-testid={`patient-unreviewed-${p.id}`}>
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />{p.unreviewed} unreviewed change{p.unreviewed > 1 ? "s" : ""}
      </span>
      {p.newest_unreviewed_start && <div className="text-xs text-muted-foreground mt-1.5">newest starts {fmtTs(p.newest_unreviewed_start)}</div>}
    </div>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`patient-unreviewed-${p.id}`}>
      {p.events_total ? <><CheckCircle2 className="h-3.5 w-3.5 text-[var(--teal)]" aria-hidden />All reviewed</> : "No changes detected"}
    </span>
  );

const NextAction = ({ p, testid = `patient-next-action-${p.id}` }) => (
  <Button asChild size="sm" variant={p.unreviewed > 0 ? "default" : "outline"} onClick={(e) => e.stopPropagation()} data-testid={testid}>
    <Link to={`/patients/${p.id}`}>{p.unreviewed > 0 ? "Review changes" : "Open timeline"}<ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden /></Link>
  </Button>
);

const Row = ({ p }) => {
  const navigate = useNavigate();
  return (
    <tr className="border-t border-[var(--line)] hover:bg-[var(--paper)] cursor-pointer transition-colors max-sm:flex max-sm:flex-col max-sm:border-t-0" onClick={() => navigate(`/patients/${p.id}`)} data-testid={`patient-row-${p.id}`}>
      <td className="px-5 py-4 max-sm:pb-1">
        <Link to={`/patients/${p.id}`} className="mono text-base font-semibold text-foreground underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()} data-testid={`patient-link-${p.id}`}>
          {p.id}
        </Link>
        <div className="text-xs text-muted-foreground">{p.data_label}</div>
      </td>
      <td className="px-5 py-4 max-sm:pt-1"><ReviewState p={p} /><div className="sm:hidden mt-3"><NextAction p={p} testid={`patient-next-action-mobile-${p.id}`} /></div></td>
      <td className="hidden md:table-cell px-5 py-4 mono">{p.latest ? <><span className="font-semibold">{p.latest.value}</span> <span className="text-muted-foreground text-xs">{p.latest.unit}</span></> : "—"}
        <div className="text-xs text-muted-foreground">{p.latest ? fmtTs(p.latest.ts) : ""}</div></td>
      <td className="hidden lg:table-cell px-5 py-4 mono text-sm">{pct(p.coverage)}<div className="text-xs text-muted-foreground">{p.readings} readings</div></td>
      <td className="hidden lg:table-cell px-5 py-4"><SummaryCell p={p} /></td>
      <td className="hidden sm:table-cell px-3 sm:px-5 py-4 text-right"><NextAction p={p} /></td>
    </tr>
  );
};

const Headline = ({ data }) => {
  const changes = data.reduce((n, p) => n + (p.unreviewed || 0), 0);
  const people = data.filter((p) => p.unreviewed > 0).length;
  return (
    <div className="flex items-end gap-4 mt-4" data-testid="overview-headline">
      <span className={`figure text-6xl sm:text-7xl ${changes > 0 ? "text-[var(--amber)]" : "text-foreground"}`} data-testid="overview-unreviewed-figure">{changes}</span>
      <p className="text-sm text-muted-foreground pb-1.5 max-w-md">
        {changes > 0
          ? <><span className="font-semibold text-foreground">unreviewed change{changes > 1 ? "s" : ""}</span> across {people} of {data.length} participant{data.length > 1 ? "s" : ""}.</>
          : <>unreviewed changes — all detected changes are reviewed across {data.length} participant{data.length > 1 ? "s" : ""}.</>}
        {" "}Sorted by newest unreviewed change; no risk ranking is applied.
      </p>
    </div>
  );
};

export default function Overview() {
  const { data, error, loading, reload } = useFetch("/patients");
  const [q, setQ] = useState("");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const rows = useMemo(
    () => (data || []).filter((p) => p.id.toLowerCase().includes(q.trim().toLowerCase()) && (!onlyUnreviewed || p.unreviewed > 0)),
    [data, q, onlyUnreviewed]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="display text-4xl sm:text-5xl">Participants</h1>
          {data && data.length > 0 ? <Headline data={data} /> : <p className="text-base text-muted-foreground mt-2">Sorted by newest unreviewed change; no risk ranking is applied.</p>}
        </div>
        <Button asChild variant="outline" data-testid="overview-import-button"><Link to="/import"><Upload className="h-4 w-4 mr-2" />Import CSV</Link></Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search participant ID" placeholder="Search participant ID" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 bg-card" data-testid="patient-search-input" />
        </div>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Switch checked={onlyUnreviewed} onCheckedChange={setOnlyUnreviewed} data-testid="filter-unreviewed-switch" />
          Only participants with unreviewed changes
        </label>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty title="No participants yet" testid="overview-empty">
          Import a glucose CSV (for example a BIG IDEAs <code>Dexcom_001.csv</code>) to create the first participant timeline.
        </Empty>
      )}
      {data && data.length > 0 && (
        <div className="space-y-3">
        <SectionRule index="01" label="Review queue" meta={`${rows.length} / ${data.length} shown`} testid="overview-rule" />
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm" data-testid="patients-table">
            <thead className="text-left max-sm:hidden">
              <tr className="eyebrow">
                <th className="px-5 py-3 font-semibold">Participant</th>
                <th className="px-5 py-3 font-semibold">Changes for review</th>
                <th className="hidden md:table-cell px-5 py-3 font-semibold">Latest glucose (as recorded)</th>
                <th className="hidden lg:table-cell px-5 py-3 font-semibold">Coverage</th>
                <th className="hidden lg:table-cell px-5 py-3 font-semibold">Event summaries</th>
                <th className="hidden sm:table-cell px-5 py-3 font-semibold text-right">Next action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => <Row key={p.id} p={p} />)}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground" data-testid="overview-no-match">No participants match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
