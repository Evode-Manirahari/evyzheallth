import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { DIRECTION, END_REASON, fmtDur, fmtTs } from "../lib/format";
import { Button } from "./ui/button";
import { EASE } from "./Micro";

export const ReviewBadge = ({ status, testid }) =>
  status === "reviewed" ? (
    <span className="pill tag-ok" data-testid={testid}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Reviewed</span>
  ) : (
    <span className="pill tag-change" data-testid={testid}><AlertCircle className="h-3.5 w-3.5" aria-hidden />Not reviewed</span>
  );

export const DirIcon = ({ d, className = "h-4 w-4" }) =>
  d === "above_baseline" ? <ArrowUpRight className={`${className} text-[var(--amber)]`} aria-hidden /> : <ArrowDownRight className={`${className} text-[var(--amber)]`} aria-hidden />;

export const EventList = ({ events, focusId, onFocus }) => (
  <ul className="space-y-2" data-testid="event-list">
    {events.map((e) => (
      <li key={e.id}>
        <button type="button" aria-pressed={e.id === focusId} onClick={() => onFocus(e.id)} data-testid={`event-item-${e.id}`}
          className="relative w-full text-left panel lift p-4">
          {e.id === focusId && <motion.span layoutId="event-focus-ring" className="absolute inset-0 rounded-[8px] pointer-events-none" style={{ boxShadow: "0 0 0 2px var(--amber-line)" }} transition={{ duration: 0.22, ease: EASE }} aria-hidden />}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold"><DirIcon d={e.direction} />{DIRECTION[e.direction]}</div>
            <ReviewBadge status={e.review_status} testid={`event-review-status-${e.id}`} />
          </div>
          <div className="mono text-sm mt-2"><span className="font-semibold">{fmtDur(e.duration_minutes)}</span> <span className="text-muted-foreground">from {fmtTs(e.start)}</span></div>
          <div className="text-xs text-muted-foreground mt-1">{END_REASON[e.end_reason]}</div>
          {e.id === focusId && <div className="text-xs font-semibold text-[var(--amber)] mt-2">Shown on all charts</div>}
        </button>
      </li>
    ))}
  </ul>
);

export const EvidencePanel = ({ e }) => (
  <motion.div className="panel mg-corners p-5 space-y-4 text-sm" data-testid="event-evidence-panel"
    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ duration: 0.2, ease: EASE }}>
    <div className="flex items-center justify-between gap-2">
      <span className="pill tag-change"><AlertCircle className="h-3.5 w-3.5" aria-hidden />Change for review</span>
      <span className="text-xs text-muted-foreground">evidence v{e.evidence_version}</span>
    </div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      <div><dt className="eyebrow">Baseline median</dt><dd className="mono font-semibold">{e.baseline.median} mg/dL</dd></div>
      <div><dt className="eyebrow">Baseline band</dt><dd className="mono font-semibold">{e.baseline.lower}–{e.baseline.upper}</dd></div>
      <div><dt className="eyebrow">Observed range</dt><dd className="mono font-semibold">{e.observed.min}–{e.observed.max}</dd></div>
      <div><dt className="eyebrow">Readings</dt><dd className="mono font-semibold">{e.observed.n_readings}</dd></div>
    </dl>
    <div className="text-xs text-muted-foreground mono">{fmtTs(e.start)} → {fmtTs(e.end)}</div>
    <Button asChild className="w-full" data-testid="open-event-review"><Link to={`/events/${e.id}`}>Open review & AI brief</Link></Button>
  </motion.div>
);
