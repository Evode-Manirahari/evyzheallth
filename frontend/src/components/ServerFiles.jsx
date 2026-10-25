import { useState } from "react";
import { toast } from "sonner";
import { Server } from "lucide-react";
import { useApi, useFetch, errMsg } from "../lib/api";
import { fmtTs } from "../lib/format";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const FileRow = ({ f, onDone }) => {
  const api = useApi();
  const [pid, setPid] = useState(f.suggested_participant_id || "");
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState(null);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/server-files/import", { filename: f.filename, participant_id: pid.trim() }, { timeout: 300000 });
      setRep(data);
      toast.success(`${f.label}: ${data.inserted} new, ${data.identical_skipped} identical skipped, ${data.conflicts_flagged} conflicts flagged`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t first:border-t-0 py-3 space-y-2" data-testid={`server-file-${f.filename}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="mono text-sm">{f.filename}</div>
          <div className="text-xs text-muted-foreground">{f.label} · {(f.size_bytes / 1e6).toFixed(1)} MB · {f.last_import ? `last imported ${fmtTs(f.last_import.created_at.slice(0, 19))} UTC for ${f.last_import.patient_id}` : "not imported yet"}</div>
        </div>
        <Input aria-label={`Participant ID for ${f.filename}`} value={pid} onChange={(e) => setPid(e.target.value)} className="mono w-28 bg-white" data-testid={`server-file-pid-${f.filename}`} />
        <Button size="sm" onClick={run} disabled={busy || !pid.trim()} data-testid={`server-file-import-${f.filename}`}>{busy ? "Processing…" : "Import on server"}</Button>
      </div>
      {rep && (
        <div className="text-xs mono grid sm:grid-cols-4 gap-2 bg-secondary/50 rounded p-2" data-testid={`server-file-report-${f.filename}`}>
          <span>raw rows {rep.raw_rows}</span><span>invalid {rep.invalid_rows}</span><span>1-min summaries {rep.aggregates}</span><span>gaps {rep.gaps}</span>
          <span>new {rep.inserted}</span><span>identical skipped {rep.identical_skipped}</span><span data-testid={`server-file-conflicts-${f.filename}`}>conflicts flagged {rep.conflicts_flagged}</span><span>{fmtTs(rep.date_range?.start)} → {fmtTs(rep.date_range?.end)}</span>
          {rep.note && <span className="sm:col-span-4 font-sans">{rep.note}</span>}
        </div>
      )}
    </div>
  );
};

export const ServerFiles = () => {
  const { data, error, reload } = useFetch("/server-files");
  if (error || !data?.length) return null;
  return (
    <div className="panel p-5" data-testid="server-files-panel">
      <div className="flex items-center gap-2 font-semibold"><Server className="h-4 w-4 text-[var(--teal)]" />Files already on the server</div>
      <p className="text-xs text-muted-foreground mt-1 mb-2">Heart-rate and skin-temperature files are processed in chunks on the server and stored as one-minute summaries (mean, min, max, sample count). Original files stay on the server, outside Git. Reimporting the same file adds nothing.</p>
      {data.map((f) => <FileRow key={f.filename} f={f} onDone={reload} />)}
    </div>
  );
};
