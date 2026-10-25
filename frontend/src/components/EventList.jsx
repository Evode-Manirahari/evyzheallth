import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { DIRECTION, END_REASON, fmtDur, fmtTs } from "../lib/format";
import { Button } from "./ui/button";

export const ReviewBadge = ({ status, testid }) =>
  status === "reviewed" ? (
    <span className="text-xs rounded px-2 py-0.5 bg-accent text-accent-foreground border border-teal-200" data-testid={testid}>Reviewed</span>
  ) : (
    <span className="text-xs rounded px-2 py-0.5 tag-change" data-testid={testid}>Not reviewed</span>
  );

export const DirIcon = ({ d }) =>
  d === "above_baseline" ? <ArrowUpRight className="h-4 w-4 text-amber-700" aria-hidden /> : <ArrowDownRight className="h-4 w-4 text-amber-700" aria-hidden />;

export const EventList = ({ events, focusId, onFocus }) => (
  <ul className="space-y-2" data-testid="event-list">
    {events.map((e) => (
      <li key={e.id}>
        <button type="button" aria-pressed={e.id === focusId} onClick={() => onFocus(e.id)} data-testid={`event-item-${e.id}`}
          className={`w-full text-left panel p-3 transition-colors hover:bg-secondary/50 ${e.id === focusId ? "ring-2 ring-amber-500 border-amber-400" : ""}`}>
          <div className="flex items-center gap-2 text-sm font-medium"><DirIcon d={e.direction} />{DIRECTION[e.direction]}</div>
          <div className="mono text-xs mt-1">{fmtTs(e.start)} · {fmtDur(e.duration_minutes)}</div>
          <div className="flex flex-wrap gap-1.5 mt-2 items-center">
            <ReviewBadge status={e.review_status} testid={`event-review-status-${e.id}`} />
            <span className="text-[11px] text-muted-foreground">{END_REASON[e.end_reason]}</span>
          </div>
        </button>
      </li>
    ))}
  </ul>
);

export const EvidencePanel = ({ e }) => (
  <div className="panel p-4 space-y-3 text-sm" data-testid="event-evidence-panel">
    <div className="flex items-center justify-between gap-2">
      <span className="tag-change rounded px-2 py-0.5 text-xs font-medium">Change for review</span>
      <span className="text-[11px] text-muted-foreground">evidence v{e.evidence_version}</span>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div><div className="eyebrow">Baseline median</div><div className="mono">{e.baseline.median} mg/dL</div></div>
      <div><div className="eyebrow">Band</div><div className="mono">{e.baseline.lower}–{e.baseline.upper}</div></div>
      <div><div className="eyebrow">Observed range</div><div className="mono">{e.observed.min}–{e.observed.max}</div></div>
      <div><div className="eyebrow">Readings</div><div className="mono">{e.observed.n_readings}</div></div>
    </div>
    <div className="text-xs text-muted-foreground">{fmtTs(e.start)} → {fmtTs(e.end)}</div>
    <Button asChild size="sm" className="w-full" data-testid="open-event-review"><Link to={`/events/${e.id}`}>Open review & AI brief</Link></Button>
  </div>
);
