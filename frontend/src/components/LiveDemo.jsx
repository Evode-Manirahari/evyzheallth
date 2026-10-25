import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Crosshair, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useApi, errMsg } from "../lib/api";
import { fmtTs } from "../lib/format";
import { Button } from "./ui/button";
import { ErrorBox } from "./StateViews";

const PIDS = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09"];
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const utc = (iso) => `${fmtTs(iso.slice(0, 19))} UTC`;

function demoErr(e) {
  const d = e?.response?.data?.detail;
  if (d?.missing) return `${d.error === "no_calibration" ? "Prepare personal calibration first." : "Required files are missing."} Missing: ${d.missing.join(", ")}`;
  if (d?.message) return d.message;
  return errMsg(e);
}

const useOp = () => {
  const [s, set] = useState({ data: null, loading: false, error: null });
  const seq = useRef(0);
  const run = useCallback(async (fn) => {
    const id = ++seq.current;
    set({ data: null, loading: true, error: null });
    try {
      const data = await fn();
      if (id === seq.current) set({ data, loading: false, error: null });
    } catch (e) {
      if (id === seq.current) set({ data: null, loading: false, error: demoErr(e) });
    }
  }, []);
  const reset = useCallback(() => { seq.current += 1; set({ data: null, loading: false, error: null }); }, []);
  return [s, run, reset];
};

const Sessions = ({ st }) => (
  <div className="grid sm:grid-cols-2 gap-3" data-testid="demo-sessions">
    {[["calibration_session", "Calibration — training session (T)", "Used only to compute the personal reference. Its class labels are never read."],
      ["evaluation_session", "Evaluation — separate session (E)", "Recorded on a different day. Predicted by both pipelines; labels are opened only afterwards for scoring."]].map(([k, title, txt]) => (
      <div key={k} className="rounded border p-3 bg-white">
        <div className="text-sm font-medium">{title}</div>
        <div className="mono text-lg" data-testid={`demo-${k}-trials`}>{st[k].trials} artifact-free trials</div>
        <div className="text-xs text-muted-foreground">{txt}</div>
      </div>
    ))}
  </div>
);

const CalResult = ({ c }) => (
  <div className="text-sm rounded border p-3 bg-white" data-testid="demo-calibration-result">
    <span className={`text-xs font-medium rounded px-2 py-0.5 ${c.mode === "computed_now" ? "bg-accent text-accent-foreground" : "bg-secondary"}`} data-testid="demo-calibration-mode">
      {c.mode === "computed_now" ? `Computed now in ${c.seconds} s` : "Loaded previously computed reference"}
    </span>
    <span className="ml-2 text-xs text-muted-foreground">{c.mode === "computed_now" ? "at" : "computed at"} {utc(c.computed_at)} · from {c.n_trials} training-session trials · labels read: no · reference <span className="mono">{c.reference_sha}</span></span>
  </div>
);

const Metric = ({ title, r, testid }) => (
  <div className="rounded border p-3 bg-white" data-testid={testid}>
    <div className="text-sm font-medium">{title}</div>
    <div className="mono text-xl mt-1">{pct(r.accuracy_unrounded)}</div>
    <div className="text-xs text-muted-foreground">macro-F1 {r.macro_f1.toFixed(3)} · {r.correct} / {r.n_test} correct</div>
  </div>
);

const FILTERS = [["all", "All"], ["fixed", "B fixed"], ["broken", "B broke"], ["both_wrong", "Both wrong"], ["both_right", "Both right"]];
const kind = (t) => (t.a !== t.true && t.b === t.true ? "fixed" : t.a === t.true && t.b !== t.true ? "broken" : t.a === t.true ? "both_right" : "both_wrong");

const TrialViewer = ({ trials, classes }) => {
  const [f, setF] = useState("all");
  const [sel, setSel] = useState(0);
  const shown = useMemo(() => trials.filter((t) => f === "all" || kind(t) === f), [trials, f]);
  const t = shown[Math.min(sel, shown.length - 1)];
  const Pred = ({ label, p, id }) => (
    <div className="flex items-center gap-1.5" data-testid={id}>{p === t.true ? <CheckCircle2 className="h-4 w-4 text-teal-700" /> : <XCircle className="h-4 w-4 text-amber-700" />}
      <span className="text-muted-foreground">{label}:</span> {classes[p - 1]} {p === t.true ? "(correct)" : "(wrong)"}</div>
  );
  return (
    <div className="space-y-2" data-testid="demo-trial-viewer">
      <div className="text-sm font-medium">Evaluation trials (recorded trials scored offline, not live streaming)</div>
      <div className="flex flex-wrap gap-1">{FILTERS.map(([k, l]) => (
        <Button key={k} size="sm" variant={f === k ? "default" : "outline"} onClick={() => { setF(k); setSel(0); }} data-testid={`demo-filter-${k}`}>
          {l} ({k === "all" ? trials.length : trials.filter((x) => kind(x) === k).length})</Button>))}</div>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground" data-testid="demo-trial-legend">
        {[["bg-teal-500", "B fixed (A wrong, B right)"], ["bg-amber-500", "B broke (A right, B wrong)"], ["bg-teal-100", "Both right"], ["bg-slate-300", "Both wrong"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><i className={`w-3 h-3 rounded-sm border inline-block ${c}`} />{l}</span>))}
      </div>
      <div className="flex flex-wrap gap-1 max-h-28 overflow-auto p-1 border rounded bg-white">{shown.map((x, i) => (
        <button key={x.id} type="button" title={x.id} onClick={() => setSel(i)} aria-pressed={i === sel} data-testid={`demo-trial-${x.id}`}
          className={`w-5 h-5 rounded-sm border text-[0px] ${i === sel ? "ring-2 ring-[var(--navy)]" : ""} ${{ fixed: "bg-teal-500", broken: "bg-amber-500", both_right: "bg-teal-100", both_wrong: "bg-slate-300" }[kind(x)]}`}>{x.id}</button>))}</div>
      {t && (
        <div className="rounded border p-3 bg-white text-sm grid sm:grid-cols-4 gap-2" data-testid="demo-trial-detail">
          <div><div className="eyebrow">Trial</div><div className="mono text-xs" data-testid="demo-trial-id">{t.id}</div></div>
          <div><div className="eyebrow">True class</div><span data-testid="demo-trial-true">{classes[t.true - 1]}</span></div>
          <Pred label="A" p={t.a} id="demo-trial-a" /><Pred label="B" p={t.b} id="demo-trial-b" />
        </div>
      )}
    </div>
  );
};

const Results = ({ r, Matrix, classes }) => {
  const ch = r.trial_changes, ck = r.benchmark_check;
  return (
    <div className="space-y-4" data-testid="demo-results">
      <div className="text-xs text-muted-foreground" data-testid="demo-computed-label">
        <span className="font-medium text-foreground">Computed now</span> at {utc(r.computed_at)}: trained A and B on {r.source_training_trials} source trials ({r.sources.join(", ")}) in {r.seconds.train_sources} s, predicted {r.A_no_alignment.n_test} evaluation trials in {r.seconds.predict} s.</div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Metric title="A · without calibration" r={r.A_no_alignment} testid="demo-metric-a" />
        <Metric title="B · with personal calibration" r={r.B_recentered} testid="demo-metric-b" />
        <div className={`rounded border p-3 ${r.delta_accuracy_pp < 0 ? "tag-change" : r.delta_accuracy_pp > 0 ? "bg-accent" : "bg-secondary"}`} data-testid="demo-delta">
          <div className="text-sm font-medium">{r.delta_accuracy_pp < 0 ? "Regression" : r.delta_accuracy_pp > 0 ? "Improvement" : "No change"} (B − A)</div>
          <div className="mono text-xl mt-1">{r.delta_accuracy_pp > 0 ? "+" : ""}{r.delta_accuracy_pp.toFixed(1)} pp</div>
          <div className="text-xs">accuracy, from unrounded values</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm" data-testid="demo-trial-changes">
        <div className="rounded border p-3 bg-white"><div className="mono text-lg">{ch.fixed_by_B}</div>trials A got wrong that B got right</div>
        <div className="rounded border p-3 bg-white"><div className="mono text-lg">{ch.broken_by_B}</div>trials A got right that B got wrong</div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Matrix title="A · without calibration" m={r.A_no_alignment.confusion_matrix} testid="demo-cm-a" />
        <Matrix title="B · with personal calibration" m={r.B_recentered.confusion_matrix} testid="demo-cm-b" />
      </div>
      <TrialViewer trials={r.trials} classes={classes} />
      <ul className="text-xs space-y-0.5" data-testid="demo-checks">
        <li>Matches the saved benchmark within ±{ck.tolerance} (accuracy, macro-F1; confusion matrices identical): <b>{ck.pass ? "yes" : "NO"}</b></li>
        <li>Calibration reference unchanged by evaluation inference (fingerprint {r.calibration.reference_sha}): <b>{r.reference_unchanged_after_inference ? "yes" : "NO"}</b></li>
        <li>Evaluation labels: {r.labels_used_for}.</li>
      </ul>
    </div>
  );
};

export const LiveDemo = ({ Matrix, classes }) => {
  const api = useApi();
  const [pid, setPid] = useState("A01");
  const [recompute, setRecompute] = useState(false);
  const [st, runSt] = useOp();
  const [cal, runCal, resetCal] = useOp();
  const [cmp, runCmp, resetCmp] = useOp();
  useEffect(() => {
    resetCal(); resetCmp();
    runSt(async () => (await api.get(`/research/demo/${pid}/status`)).data);
  }, [pid, api, runSt, resetCal, resetCmp]);
  const hasRef = !!(cal.data || st.data?.reference);
  const busy = cal.loading || cmp.loading;
  return (
    <section className="panel p-5 space-y-4 border-[var(--teal)]" data-testid="live-demo">
      <div>
        <h2 className="text-lg font-semibold" data-testid="live-demo-title">Interactive EEG personalization demo</h2>
        <p className="text-sm font-medium mt-1" data-testid="live-demo-offline-note">Runs calibration and inference on prerecorded EEG processed offline.</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">Runs the benchmark's pipelines on request. Personal calibration recenters the input covariances with a reference from the participant's own training session — input calibration, not model fine-tuning. Separate from the clinic's glucose change detection.</p>
        <ul className="text-xs mt-2 list-disc pl-5 text-muted-foreground" data-testid="demo-disclosures">
          <li><b className="text-foreground">Complete-run zero-phase filtering:</b> 8–30 Hz filter applied forward and backward over each whole recorded run (not possible in real time).</li>
          <li><b className="text-foreground">Expert artifact exclusions:</b> trials flagged by the dataset's experts are removed from both sessions.</li>
          <li><b className="text-foreground">Full training session for calibration:</b> the reference uses all of the participant's artifact-free training-session trials.</li>
          <li>Precomputed per-session covariances are used for speed; the pipelines themselves are trained and run when you click.</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Demo participant">
        {PIDS.map((p) => (
          <button key={p} type="button" disabled={busy} aria-pressed={p === pid} onClick={() => setPid(p)} data-testid={`demo-select-${p}`}
            className={`mono text-sm px-3 py-1.5 rounded-md border ${p === pid ? "bg-[var(--navy)] text-white" : "bg-white hover:bg-secondary"}`}>{p}</button>
        ))}
      </div>
      {st.loading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Checking prepared data…</div>}
      {st.error && <ErrorBox message={st.error} testid="demo-status-error" />}
      {st.data && st.data.missing.length > 0 && (
        <div role="alert" className="text-sm tag-change rounded p-3" data-testid="demo-missing">
          Prepared data for {pid} is incomplete, so nothing can be computed. Missing in <span className="mono">{st.data.artifacts_dir}</span>: <span className="mono">{st.data.missing.join(", ")}</span>. Run <span className="mono">python demo_cli.py prepare</span> in the research module to rebuild them.
        </div>
      )}
      {st.data && st.data.missing.length === 0 && (
        <>
          <Sessions st={st.data} />
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy} onClick={() => runCal(async () => (await api.post(`/research/demo/${pid}/calibrate`, null, { params: { recompute } })).data)} data-testid="demo-calibrate-button">
              {cal.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crosshair className="h-4 w-4 mr-2" />}Prepare personal calibration</Button>
            <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={recompute} onChange={(e) => setRecompute(e.target.checked)} data-testid="demo-recompute-checkbox" />Recompute even if a saved reference exists</label>
            <Button variant="outline" disabled={busy || !hasRef} onClick={() => runCmp(async () => (await api.post(`/research/demo/${pid}/compare`, null, { timeout: 200000 })).data)} data-testid="demo-compare-button">
              {cmp.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Compare predictions</Button>
            {!hasRef && <span className="text-xs text-muted-foreground">No saved reference for {pid} yet — prepare calibration first.</span>}
          </div>
          {cal.error && <ErrorBox message={cal.error} testid="demo-calibrate-error" />}
          {cal.data && <CalResult c={cal.data} />}
          {!cal.data && st.data.reference && <div className="text-xs text-muted-foreground" data-testid="demo-saved-reference">Saved reference available (computed {utc(st.data.reference.computed_at)}). Click “Prepare personal calibration” to load it, or tick recompute.</div>}
          {cmp.loading && <div className="text-sm text-muted-foreground" role="status" data-testid="demo-compare-loading">Training both pipelines on the 8 other participants and predicting {pid}'s evaluation trials… this usually takes 10–20 s.</div>}
          {cmp.error && <ErrorBox message={cmp.error} testid="demo-compare-error" />}
          {cmp.data && <Results r={cmp.data} Matrix={Matrix} classes={classes} />}
        </>
      )}
    </section>
  );
};
