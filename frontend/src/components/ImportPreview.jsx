import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Stat } from "./StateViews";
import { fmtTs } from "../lib/format";

const Sel = ({ label, value, onChange, options, testid, allowNone }) => (
  <label className="text-sm space-y-1 block">
    <span className="eyebrow block">{label}</span>
    <select className="w-full h-9 rounded-md border bg-white px-2 text-sm" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} data-testid={testid}>
      {allowNone && <option value="">— none —</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </label>
);

const Mapping = ({ preview, onRemap, busy }) => {
  const [m, setM] = useState(preview.mapping || {});
  useEffect(() => { setM(preview.mapping || {}); }, [preview]);
  const set = (k) => (v) => setM((x) => ({ ...x, [k]: v }));
  const cols = preview.columns || [];
  return (
    <div className="panel p-5 space-y-4" data-testid="import-mapping">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Column mapping {preview.auto_detected && <span className="text-xs font-normal text-muted-foreground">(auto-detected)</span>}</div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onRemap(m)} data-testid="import-apply-mapping">Apply mapping</Button>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="text-sm space-y-1 block">
          <span className="eyebrow block">Header row (0-based)</span>
          <input type="number" min={0} className="w-full h-9 rounded-md border bg-white px-2 mono" value={m.header_row ?? 0} onChange={(e) => set("header_row")(Number(e.target.value))} data-testid="map-header-row" />
        </label>
        <Sel label="Timestamp column" value={m.timestamp_col} onChange={set("timestamp_col")} options={cols} testid="map-timestamp-col" allowNone />
        <Sel label="Glucose value column" value={m.value_col} onChange={set("value_col")} options={cols} testid="map-value-col" allowNone />
        <Sel label="Unit" value={m.unit} onChange={set("unit")} options={["mg/dL", "mmol/L"]} testid="map-unit" allowNone />
        <Sel label="Event type column (optional)" value={m.event_type_col} onChange={set("event_type_col")} options={cols} testid="map-event-col" allowNone />
        <label className="text-sm space-y-1 block">
          <span className="eyebrow block">Keep rows where event type =</span>
          <input className="w-full h-9 rounded-md border bg-white px-2 mono" value={m.event_type_value ?? ""} onChange={(e) => set("event_type_value")(e.target.value)} data-testid="map-event-value" />
        </label>
      </div>
      {m.unit_in_header && <p className="text-xs text-muted-foreground">Unit stated in header: <span className="mono">{m.unit_in_header}</span>. mmol/L is converted to mg/dL (× 18.0182).</p>}
    </div>
  );
};

export const ImportPreview = ({ preview, onRemap, busy }) => (
  <div className="space-y-6" data-testid="import-preview">
    {preview.problems?.length > 0 && (
      <div role="alert" className="panel border-amber-300 bg-amber-50 p-4 text-sm space-y-1" data-testid="import-problems">
        <div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" />Mapping needed</div>
        {preview.problems.map((p) => <div key={p} className="text-amber-900">{p}</div>)}
      </div>
    )}
    <Mapping preview={preview} onRemap={onRemap} busy={busy} />
    {!preview.needs_mapping && (
      <div className="panel p-5 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Preview</span>
          <span className="text-xs rounded px-2 py-0.5 bg-secondary" data-testid="import-data-label">{preview.data_label}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Stat label="Accepted rows" value={preview.accepted} testid="preview-accepted" />
          <Stat label="Rejected rows" value={preview.rejected} testid="preview-rejected" />
          <Stat label="Duplicates in file" value={preview.duplicates_in_file} testid="preview-dup-file" />
          <Stat label="Already stored" value={preview.already_stored} sub="for this participant ID" testid="preview-already-stored" />
          <Stat label="First reading" value={fmtTs(preview.date_range?.start)} testid="preview-start" />
          <Stat label="Last reading" value={fmtTs(preview.date_range?.end)} testid="preview-end" />
          <Stat label="Source unit" value={preview.unit} sub={`stored as mg/dL · conversion ${preview.conversion}`} testid="preview-unit" />
          <Stat label="Timezone" value="As recorded" sub={preview.timezone} testid="preview-timezone" />
        </div>
        <div className="text-sm">
          <div className="eyebrow mb-1">Detected columns</div>
          <div className="flex flex-wrap gap-1.5">{preview.columns.map((c) => <code key={c} className="text-xs bg-secondary rounded px-1.5 py-0.5">{c}</code>)}</div>
        </div>
        {Object.keys(preview.skipped_non_reading_rows || {}).length > 0 && (
          <div className="text-sm"><span className="eyebrow">Skipped metadata / non-reading rows: </span>
            {Object.entries(preview.skipped_non_reading_rows).map(([k, v]) => `${k} (${v})`).join(", ")}</div>
        )}
        {preview.rejected > 0 && (
          <div className="space-y-2" data-testid="preview-rejected-details">
            <div className="eyebrow">Rejected reasons</div>
            <ul className="text-sm list-disc pl-5">{Object.entries(preview.rejected_reasons).map(([k, v]) => <li key={k}>{k}: <span className="mono">{v}</span></li>)}</ul>
            <div className="overflow-x-auto"><table className="text-xs w-full mono">
              <tbody>{preview.rejected_samples.map((r) => (
                <tr key={r.line} className="border-t"><td className="py-1 pr-3">line {r.line}</td><td className="pr-3 font-sans">{r.reason}</td><td className="text-muted-foreground truncate max-w-md">{r.raw}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        )}
      </div>
    )}
  </div>
);
