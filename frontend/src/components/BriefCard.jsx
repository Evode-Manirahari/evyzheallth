import { Sparkles, FileText, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Loading, ErrorBox } from "./StateViews";
import { fmtTs } from "../lib/format";

const STATUS_TEXT = {
  fallback_unconfigured: "AI is not configured",
  fallback_api_error: "AI request failed",
  fallback_invalid_output: "AI output failed validation",
};

const Section = ({ title, children, testid }) => (
  <div>
    <div className="eyebrow mb-1">{title}</div>
    <p className="text-[15px] leading-relaxed max-w-[72ch]" data-testid={testid}>{children}</p>
  </div>
);

const RefChip = ({ id, readingsById }) => {
  const r = readingsById[id];
  return (
    <code className="text-[11px] bg-secondary rounded px-1.5 py-0.5" title={id}>
      {r ? `${fmtTs(r.ts)} · ${r.value}` : id.replace("stat:", "stats: ")}
    </code>
  );
};

export const BriefCard = ({ summary, loading, error, onRetry, readings }) => {
  if (loading) return <div className="panel p-5"><Loading label="Generating evidence-grounded brief…" testid="brief-loading" /></div>;
  if (error) return <ErrorBox message={`Brief unavailable: ${error}. Charts, evidence and review still work.`} onRetry={onRetry} testid="brief-error" />;
  if (!summary) return null;
  const o = summary.output;
  const ai = summary.source === "ai";
  const byId = Object.fromEntries(readings.map((r) => [r.id, r]));
  return (
    <div className="panel p-5 sm:p-6 space-y-5" data-testid="brief-card">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {ai ? (
          <span className="pill tag-ok" data-testid="brief-source-label">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />AI-generated brief · {summary.model}
          </span>
        ) : (
          <span className="pill bg-secondary text-foreground" data-testid="brief-source-label">
            <FileText className="h-3.5 w-3.5" aria-hidden />Template summary — {STATUS_TEXT[summary.generation_status] || "deterministic"}
          </span>
        )}
        <span className="text-xs text-muted-foreground" data-testid="brief-cache-info">
          evidence v{summary.evidence_version} · {summary.cached ? "cached" : "new"} · {fmtTs(summary.created_at?.slice(0, 19))} UTC
        </span>
      </div>
      <Section title="What changed" testid="brief-what-changed">{o.what_changed}</Section>
      <Section title="When and how long" testid="brief-timing">{o.timing}</Section>
      <Section title="Compared with earlier baseline" testid="brief-baseline">{o.baseline_comparison}</Section>
      <Section title="Data gaps" testid="brief-gaps">{o.data_gaps}</Section>
      <div>
        <div className="eyebrow mb-1">Limitations</div>
        <ul className="text-sm list-disc pl-5 space-y-0.5" data-testid="brief-limitations">{o.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
      <div>
        <div className="eyebrow mb-1">Evidence referenced</div>
        <div className="flex flex-wrap gap-1.5" data-testid="brief-evidence-refs">{o.evidence_refs.map((id) => <RefChip key={id} id={id} readingsById={byId} />)}</div>
      </div>
      {!ai && summary.validation_errors?.length > 0 && (
        <div className="text-xs text-muted-foreground" data-testid="brief-validation-errors">Fallback reason: {summary.validation_errors.join("; ")}</div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <p className="text-xs text-muted-foreground">Generated only from this participant's computed event statistics. Not a diagnosis, cause or treatment recommendation.</p>
        {!ai && <Button size="sm" variant="outline" onClick={onRetry} data-testid="brief-retry-ai"><RefreshCw className="h-3.5 w-3.5 mr-1" />Try AI again</Button>}
      </div>
    </div>
  );
};
