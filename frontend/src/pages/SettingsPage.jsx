import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useApi, useFetch, errMsg } from "../lib/api";
import { SETTING_LABELS } from "../lib/format";
import { Button } from "../components/ui/button";
import { Loading, ErrorBox } from "../components/StateViews";

export default function SettingsPage() {
  const api = useApi();
  const { data, error, loading, reload } = useFetch("/settings");
  const [vals, setVals] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setVals((v) => v || data.values); }, [data]);

  const submit = async (body) => {
    setBusy(true);
    try {
      const { data: r } = body ? await api.put("/settings", body) : await api.post("/recompute");
      const n = Object.values(r.recomputed).reduce((a, x) => a + x.events, 0);
      toast.success(`Recomputed ${Object.keys(r.recomputed).length} participant(s): ${n} change(s) for review. Reviews were preserved.`);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !vals) return error ? <ErrorBox message={error} onRetry={reload} /> : <Loading />;
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="eyebrow">Detector</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Change-detection settings</h1>
        <p className="text-sm text-muted-foreground mt-2">Unvalidated demonstration settings. Each reading is compared with the participant's own preceding readings (current and future readings excluded). A reading is flagged outside median ± max(multiplier × scale × MAD, minimum half-width). Consecutive same-direction flags lasting at least the minimum duration form one change for review.</p>
        <p className="text-xs mono mt-2" data-testid="detector-version">{data.version}</p>
      </div>
      <form className="panel p-5 grid sm:grid-cols-2 gap-5" onSubmit={(e) => { e.preventDefault(); submit(vals); }} data-testid="settings-form">
        {Object.keys(data.defaults).map((k) => (
          <label key={k} className="text-sm space-y-1 block">
            <span className="font-medium block">{SETTING_LABELS[k][0]}</span>
            <input type="number" step="any" required className="w-full h-9 rounded-md border bg-white px-2 mono" value={vals[k]}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value === "" ? "" : Number(e.target.value) })} data-testid={`setting-${k}`} />
            <span className="text-xs text-muted-foreground">{SETTING_LABELS[k][1]} · default {data.defaults[k]}</span>
          </label>
        ))}
        <div className="sm:col-span-2 flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={busy} data-testid="settings-save-button">{busy ? "Recomputing…" : "Save & recompute"}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setVals(data.defaults)} data-testid="settings-reset-button">Reset to defaults</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => submit(null)} data-testid="recompute-button">Recompute with saved settings</Button>
        </div>
      </form>
    </div>
  );
}
