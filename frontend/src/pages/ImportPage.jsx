import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { FileUp, CheckCircle2 } from "lucide-react";
import { useApi, errMsg } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ErrorBox, Loading } from "../components/StateViews";
import { ImportPreview } from "../components/ImportPreview";
import { ServerFiles } from "../components/ServerFiles";

export default function ImportPage() {
  const api = useApi();
  const [preview, setPreview] = useState(null);
  const [pid, setPid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file) => run(async () => {
    if (!file) return;
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await api.post("/imports/preview", fd);
    setPreview(data);
    setPid(data.suggested_participant_id || "");
  });

  const remap = (mapping) => run(async () => {
    const { data } = await api.post(`/imports/${preview.import_id}/remap`, { mapping, participant_id: pid || null });
    setPreview(data);
  });

  const commit = () => run(async () => {
    const { data } = await api.post(`/imports/${preview.import_id}/commit`, { participant_id: pid.trim() });
    setResult(data);
    setPreview(null);
    toast.success(`Imported ${data.inserted} new readings for ${data.patient_id}`);
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Import data</h1>
        <p className="text-sm text-muted-foreground mt-1">One participant per file. Dexcom exports (BIG IDEAs format) are detected automatically; other layouts can be mapped manually. Reimporting a file never duplicates readings.</p>
      </div>

      <label htmlFor="csv-file" className="panel border-dashed p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 cursor-pointer hover:bg-secondary/40 focus-within:ring-2 focus-within:ring-ring">
        <FileUp className="h-6 w-6 text-[var(--teal)]" aria-hidden />
        <div className="flex-1">
          <div className="font-medium">Choose a .csv file</div>
          <div className="text-xs text-muted-foreground">Raw files are parsed on the server; only validated readings are stored. Max 15 MB.</div>
        </div>
        <input id="csv-file" type="file" accept=".csv,text/csv" className="text-sm" data-testid="import-file-input"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>

      <ServerFiles />
      {busy && <Loading label="Processing…" testid="import-busy" />}
      {error && <ErrorBox message={error} testid="import-error" />}

      {preview && (
        <div className="space-y-6">
          <div className="panel p-5 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="pid">Participant ID (confirm before importing)</Label>
              <Input id="pid" value={pid} onChange={(e) => setPid(e.target.value)} className="mono max-w-xs bg-white" placeholder="e.g. 001" data-testid="import-participant-input" />
              <p className="text-xs text-muted-foreground">
                {preview.suggested_participant_id ? <>Suggested from filename <span className="mono">{preview.filename}</span>. Leading zeros are preserved.</> : "No ID could be read from the filename — enter it manually."}
                {" "}<button type="button" className="underline underline-offset-2 text-[var(--teal)]" onClick={() => remap(preview.mapping)} data-testid="import-check-duplicates">Check already-stored readings for this ID</button>
              </p>
            </div>
            <Button onClick={commit} disabled={busy || preview.needs_mapping || !pid.trim() || !preview.accepted} data-testid="import-commit-button">
              Import {preview.new_readings ?? preview.accepted} new readings
            </Button>
          </div>
          <ImportPreview preview={preview} onRemap={remap} busy={busy} />
        </div>
      )}

      {result && (
        <div className="panel p-6 space-y-3" data-testid="import-result">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-[var(--teal)]" />Import complete — participant <span className="mono">{result.patient_id}</span></div>
          <div className="text-sm grid sm:grid-cols-4 gap-3">
            <div><span className="eyebrow block">New readings</span><span className="mono" data-testid="import-result-inserted">{result.inserted}</span></div>
            <div><span className="eyebrow block">Duplicates skipped</span><span className="mono" data-testid="import-result-duplicates">{result.duplicates_skipped}</span></div>
            <div><span className="eyebrow block">Rejected rows</span><span className="mono">{result.rejected}</span></div>
            <div><span className="eyebrow block">Changes detected</span><span className="mono" data-testid="import-result-events">{result.detection.events}</span></div>
          </div>
          <Button asChild variant="outline" data-testid="import-open-patient"><Link to={`/patients/${result.patient_id}`}>Open participant timeline</Link></Button>
        </div>
      )}
    </div>
  );
}
