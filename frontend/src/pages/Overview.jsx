import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Upload } from "lucide-react";
import { useFetch } from "../lib/api";
import { fmtTs, pct } from "../lib/format";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Loading, ErrorBox, Empty } from "../components/StateViews";

const SummaryCell = ({ p }) => {
  if (!p.events_total) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-xs">
      {p.ai_summaries} AI · {p.template_summaries} template · {p.events_total - p.ai_summaries - p.template_summaries} not generated
    </span>
  );
};

const Row = ({ p }) => {
  const navigate = useNavigate();
  return (
    <tr className="border-t hover:bg-secondary/50 cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)} data-testid={`patient-row-${p.id}`}>
      <td className="px-4 py-3">
        <Link to={`/patients/${p.id}`} className="mono font-medium text-[var(--navy)] underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()} data-testid={`patient-link-${p.id}`}>
          {p.id}
        </Link>
        <div className="text-[11px] text-muted-foreground">{p.data_label}</div>
      </td>
      <td className="px-4 py-3 mono">{p.latest ? `${p.latest.value} ${p.latest.unit}` : "—"}</td>
      <td className="px-4 py-3 mono text-sm">{p.latest ? fmtTs(p.latest.ts) : "—"}</td>
      <td className="px-4 py-3 mono text-sm">{pct(p.coverage)}<span className="text-muted-foreground"> · {p.readings} readings</span></td>
      <td className="px-4 py-3">
        {p.unreviewed > 0 ? (
          <span className="tag-change inline-flex items-center rounded px-2 py-0.5 text-xs font-medium" data-testid={`patient-unreviewed-${p.id}`}>
            {p.unreviewed} unreviewed change{p.unreviewed > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid={`patient-unreviewed-${p.id}`}>
            {p.events_total ? "All reviewed" : "No changes detected"}
          </span>
        )}
        {p.newest_unreviewed_start && <div className="text-[11px] text-muted-foreground mt-1">newest {fmtTs(p.newest_unreviewed_start)}</div>}
      </td>
      <td className="px-4 py-3"><SummaryCell p={p} /></td>
    </tr>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Patient overview</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Participants</h1>
          <p className="text-sm text-muted-foreground mt-1">Sorted by newest unreviewed change. No risk ranking is applied.</p>
        </div>
        <Button asChild data-testid="overview-import-button"><Link to="/import"><Upload className="h-4 w-4 mr-2" />Import CSV</Link></Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search participant ID" placeholder="Search participant ID" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 bg-white" data-testid="patient-search-input" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Switch checked={onlyUnreviewed} onCheckedChange={setOnlyUnreviewed} data-testid="filter-unreviewed-switch" />
          Only participants with unreviewed changes
        </label>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty title="No participants yet" testid="overview-empty">
          Import a glucose CSV (for example a BIG IDEAs <span className="mono">Dexcom_001.csv</span>) to create the first participant timeline.
        </Empty>
      )}
      {data && data.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm" data-testid="patients-table">
            <thead className="text-left bg-secondary/60">
              <tr className="eyebrow">
                <th className="px-4 py-2.5 font-semibold">Participant</th>
                <th className="px-4 py-2.5 font-semibold">Latest glucose</th>
                <th className="px-4 py-2.5 font-semibold">Measured at (as recorded)</th>
                <th className="px-4 py-2.5 font-semibold">Coverage</th>
                <th className="px-4 py-2.5 font-semibold">Changes for review</th>
                <th className="px-4 py-2.5 font-semibold">Event summaries</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => <Row key={p.id} p={p} />)}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground" data-testid="overview-no-match">No participants match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
