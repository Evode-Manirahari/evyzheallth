import { Loader2, AlertTriangle, Inbox } from "lucide-react";
import { Button } from "./ui/button";

export const Loading = ({ label = "Loading…", testid = "loading-state" }) => (
  <div data-testid={testid} role="status" className="flex items-center gap-2 py-16 justify-center text-muted-foreground text-sm">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
  </div>
);

export const ErrorBox = ({ message, onRetry, testid = "error-state" }) => (
  <div data-testid={testid} role="alert" className="rounded-[10px] tag-regress p-4 flex items-start gap-3 text-sm">
    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
    <div className="flex-1 text-foreground">{message}</div>
    {onRetry && (
      <Button size="sm" variant="outline" className="bg-card" onClick={onRetry} data-testid={`${testid}-retry`}>Retry</Button>
    )}
  </div>
);

export const Empty = ({ title, children, testid = "empty-state" }) => (
  <div data-testid={testid} className="panel p-10 flex flex-col items-start gap-3">
    <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
    <div className="font-semibold">{title}</div>
    <div className="text-sm text-muted-foreground max-w-xl">{children}</div>
  </div>
);

export const Stat = ({ label, value, sub, testid }) => (
  <div className="min-w-0">
    <div className="eyebrow">{label}</div>
    <div className="mono text-lg font-semibold mt-0.5 truncate" data-testid={testid}>{value}</div>
    {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);
