import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Play, Crosshair, CheckCircle2, XCircle, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useApi, errMsg } from "../lib/api";
import { fmtTs } from "../lib/format";
import { Button } from "./ui/button";
import { ErrorBox } from "./StateViews";
import { DeltaBar, EASE } from "./Micro";

const PIDS = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09"];
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const sgn = (d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)}`;
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

const Step = ({ n, state, title, hint, children, testid }) => (
  <li className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3" data-testid={testid} data-state={state}>
    <span className="step-num mt-0.5" data-state={state} aria-hidden>{state === "done" ? <CheckCircle2 className="h-4 w-4" /> : n}</span>
    <div className="min-w-0">
      <h3 className="text-base font-semibold">{title} <span className="sr-only">({state === "done" ? "complete" : state === "active" ? "current step" : "not started"})</span></h3>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
    <div className="col-start-2 min-w-0 space-y-3">{children}</div>
  </li>
);

const Sessions = ({ st }) => (
  <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm" data-testid="demo-sessions">
    {[["calibration_session", "Calibration — training session (T)", "Used only to compute the personal reference. Its class labels are never read."],
      ["evaluation_session", "Evaluation — separate session (E)", "Recorded on a different day. Predicted by both pipelines; labels are opened only afterwards for scoring."]].map(([k, title, txt]) => (
      <div key={k}>
        <dt className="font-medium">{title}</dt>
        <dd><span className="mono text-lg font-semibold" data-testid={`demo-${k}-trials`}>{st[k].trials} artifact-free trials</span>
          <div className="text-xs text-muted-foreground">{txt}</div></dd>
      </div>
    ))}
  </dl>
);

const CalResult = ({ c }) => (
  <div className="text-sm flex flex-wrap items-center gap-2 enter" data-testid="demo-calibration-result">
    <span className={`pill ${c.mode === "computed_now" ? "tag-ok" : "bg-secondary text-foreground"}`} data-testid="demo-calibration-mode">
      {c.mode === "computed_now" ? `Computed now in ${c.seconds} s` : "Loaded previously computed reference"}
    </span>
    <span className="text-xs text-muted-foreground">{c.mode === "computed_now" ? "at" : "computed at"} {utc(c.computed_at)} · from {c.n_trials} training-session trials · labels read: no</span>
    <details className="w-full text-xs text-muted-foreground" data-testid="demo-calibration-technical">
      <summary className="cursor-pointer font-medium text-foreground w-fit rounded">Technical details</summary>
      <div className="mt-1">Reference fingerprint <code>{c.reference_sha}</code>{c.input_sha && <> · input fingerprint <code>{c.input_sha}</code></>}</div>
    </details>
  </div>
);

const Metric = ({ title, r, testid }) => (
  <div className="panel p-4" data-testid={testid}>
    <div className="text-sm font-medium">{title}</div>
    <div className="mono text-3xl font-semibold mt-1">{pct(r.accuracy_unrounded)}</div>
    <div className="text-xs text-muted-foreground">accuracy · macro-F1 {r.macro_f1.toFixed(3)} · {r.correct} / {r.n_test} correct</div>
  </div>
);

const Delta = ({ d }) => {
  const [label, cls, Icon] = d < 0 ? ["Regression", "tag-regress", TrendingDown] : d > 0 ? ["Improvement", "tag-ok", TrendingUp] : ["No change", "bg-secondary text-foreground", Minus];
  return (
    <div className={`rounded-[10px] p-4 ${cls}`} data-testid="demo-delta">
      <div className="text-sm font-semibold flex items-center gap-1.5"><Icon className="h-4 w-4" aria-hidden />{label} (B − A)</div>
      <div className="mono text-3xl font-semibold mt-1">{sgn(d)} pp</div>
      <div className="mt-2"><DeltaBar value={d} max={15} label={`${label} of ${d.toFixed(1)} percentage points`} testid="demo-delta-bar" /></div>
      <div className="text-xs mt-1">accuracy, from unrounded values · scale ±15 pp</div>
    </div>
  );
};

const FILTERS = [["all", "All"], ["fixed", "B fixed"], ["broken", "B broke"], ["both_wrong", "Both wrong"], ["both_right", "Both right"]];
const KIND_CLS = { fixed: "bg-teal-600", broken: "bg-[#c2410c]", both_right: "bg-teal-100", both_wrong: "bg-stone-300" };
const kind = (t) => (t.a !== t.true && t.b === t.true ? "fixed" : t.a === t.true && t.b !== t.true ? "broken" : t.a === t.true ? "both_right" : "both_wrong");

const TrialViewer = ({ trials, classes }) => {
  const [f, setF] = useState("all");
  const [sel, setSel] = useState(0);
  const shown = useMemo(() => trials.filter((t) => f === "all" || kind(t) === f), [trials, f]);
  const t = shown[Math.min(sel, shown.length - 1)];
  const Pred = ({ label, p, id }) => (
    <div className="flex items-center gap-1.5" data-testid={id}>{p === t.true ? <CheckCircle2 className="h-4 w-4 text-[var(--teal)]" aria-hidden /> : <XCircle className="h-4 w-4 text-[var(--regress)]" aria-hidden />}
      <span className="text-muted-foreground">{label}:</span> {classes[p - 1]} <b>{p === t.true ? "(correct)" : "(wrong)"}</b></div>
  );
  return (
    <div className="space-y-3" data-testid="demo-trial-viewer">
      <h4 className="text-sm font-semibold">Evaluation trials <span className="font-normal text-muted-foreground">· recorded trials scored offline, not live streaming</span></h4>
      <div className="flex flex-wrap gap-1">{FILTERS.map(([k, l]) => (
        <Button key={k} size="sm" variant={f === k ? "default" : "outline"} onClick={() => { setF(k); setSel(0); }} aria-pressed={f === k} data-testid={`demo-filter-${k}`}>
          {l} ({k === "all" ? trials.length : trials.filter((x) => kind(x) === k).length})</Button>))}</div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" data-testid="demo-trial-legend">
        {[["fixed", "B fixed (A wrong, B right)"], ["broken", "B broke (A right, B wrong)"], ["both_right", "Both right"], ["both_wrong", "Both wrong"]].map(([k, l]) => (
          <span key={l} className="flex items-center gap-1"><i className={`w-3 h-3 rounded-sm inline-grid place-items-center ${KIND_CLS[k]}`}>{k === "broken" && <XCircle className="h-2.5 w-2.5 text-white" aria-hidden />}{k === "fixed" && <CheckCircle2 className="h-2.5 w-2.5 text-white" aria-hidden />}</i>{l}</span>))}
      </div>
      <div className="flex flex-wrap gap-1 max-h-28 overflow-auto p-2 rounded-md bg-[var(--paper)]">{shown.map((x, i) => (
        <button key={x.id} type="button" title={`${x.id}: ${kind(x).replace("_", " ")}`} aria-label={`Trial ${x.id}, ${kind(x).replace("_", " ")}`} onClick={() => setSel(i)} aria-pressed={i === sel} data-testid={`demo-trial-${x.id}`}
          className={`w-5 h-5 rounded-sm text-[0px] grid place-items-center ${i === sel ? "ring-2 ring-offset-1 ring-foreground" : ""} ${KIND_CLS[kind(x)]}`}>{x.id}{kind(x) === "broken" && <XCircle className="h-3 w-3 text-white" aria-hidden />}{kind(x) === "fixed" && <CheckCircle2 className="h-3 w-3 text-white" aria-hidden />}</button>))}</div>
      {t && (
        <div className="panel p-4 text-sm grid sm:grid-cols-4 gap-3" data-testid="demo-trial-detail">
          <div><div className="eyebrow">Trial</div><code className="text-xs" data-testid="demo-trial-id">{t.id}</code></div>
          <div><div className="eyebrow">True class</div><span className="font-medium" data-testid="demo-trial-true">{classes[t.true - 1]}</span></div>
          <Pred label="A" p={t.a} id="demo-trial-a" /><Pred label="B" p={t.b} id="demo-trial-b" />
        </div>
      )}
    </div>
  );
};

const reveal = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE } } };

export const Results = ({ r, Matrix, classes }) => {
  const ch = r.trial_changes, ck = r.benchmark_check;
  const still = useReducedMotion();
  return (
    <motion.div className="space-y-6" data-testid="demo-results" initial={still ? false : "hidden"} animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
      <motion.div variants={reveal} className="text-xs text-muted-foreground" data-testid="demo-computed-label">
        <span className="pill tag-ok mr-2">Computed now</span>at {utc(r.computed_at)} on {r.A_no_alignment.n_test} prerecorded evaluation trials, processed offline.</motion.div>
      <motion.div variants={reveal} className="grid sm:grid-cols-3 gap-3">
        <Metric title="Before · A without calibration" r={r.A_no_alignment} testid="demo-metric-a" />
        <Metric title="After · B with personal calibration" r={r.B_recentered} testid="demo-metric-b" />
        <Delta d={r.delta_accuracy_pp} />
      </motion.div>
      <motion.div variants={reveal} className="grid grid-cols-2 gap-3 text-sm" data-testid="demo-trial-changes">
        <div><div className="mono text-2xl font-semibold text-[var(--teal)]">{ch.fixed_by_B}</div>trials A got wrong that B got right</div>
        <div><div className="mono text-2xl font-semibold text-[var(--regress)]">{ch.broken_by_B}</div>trials A got right that B got wrong</div>
      </motion.div>
      <motion.div variants={reveal} className="grid md:grid-cols-2 gap-6">
        <Matrix title="A · without calibration" m={r.A_no_alignment.confusion_matrix} testid="demo-cm-a" />
        <Matrix title="B · with personal calibration" m={r.B_recentered.confusion_matrix} testid="demo-cm-b" />
      </motion.div>
      <motion.div variants={reveal}><TrialViewer trials={r.trials} classes={classes} /></motion.div>
      <details className="text-xs border-t border-[var(--line)] pt-4" data-testid="demo-technical-details">
        <summary className="cursor-pointer text-sm font-semibold w-fit rounded" data-testid="demo-technical-toggle">Technical details <span className="font-normal text-muted-foreground">· provenance, fingerprints, benchmark check</span></summary>
        <ul className="space-y-1 mt-3 text-muted-foreground" data-testid="demo-checks">
          <li>{r.source_models ? <>Source models prepared beforehand ({r.source_models}); {r.source_training_trials} source trials.</> : <>Trained A and B on {r.source_training_trials} source trials ({r.sources.join(", ")}) in {r.seconds.train_sources} s;</>} predicted {r.A_no_alignment.n_test} evaluation trials in {r.seconds.predict} s.</li>
          <li>Calibration used: computed {utc(r.calibration.computed_at)} from {r.calibration.n_trials} training-session trials.</li>
          <li>Matches the saved benchmark within ±{ck.tolerance} (accuracy, macro-F1; confusion matrices identical): <b className="text-foreground">{ck.pass ? "yes" : "NO"}</b></li>
          <li>Calibration reference unchanged by evaluation inference (fingerprint <code>{r.calibration.reference_sha}</code>): <b className="text-foreground">{r.reference_unchanged_after_inference ? "yes" : "NO"}</b></li>
          <li>Evaluation labels: {r.labels_used_for}.</li>
        </ul>
      </details>
    </motion.div>
  );
};

const NODE_DOT = { done: "bg-[var(--teal)]", run: "bg-[var(--amber-line)]", todo: "bg-transparent ring-1 ring-inset ring-[var(--ink-2)]", regress: "bg-[var(--regress)]" };

const SignalPath = ({ nodes }) => (
  <ol className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--line)] rounded-[8px] overflow-hidden" aria-label="Demo progress" aria-live="polite" data-testid="demo-signal-path">
    {nodes.map(([k, title, value, state], i) => (
      <li key={k} className="bg-[var(--surface)] p-3 sm:p-4 min-w-0" data-testid={`demo-node-${k}`} data-state={state}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="mg-index">{String(i + 1).padStart(2, "0")}</span>
          <span className="relative inline-flex h-2.5 w-2.5">
            {state === "run" && <span className="absolute inset-0 rounded-full bg-[var(--amber-line)] mg-pulse" aria-hidden />}
            <span className={`relative h-2.5 w-2.5 rounded-full ${NODE_DOT[state]}`} aria-hidden />
          </span>
          <span className="font-semibold text-foreground">{title}</span>
        </div>
        <motion.div key={value} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE }}
          className={`mt-1.5 text-sm font-semibold truncate ${state === "regress" ? "text-[var(--regress)]" : state === "run" ? "text-[var(--amber)]" : ""}`}>{value}</motion.div>
      </li>
    ))}
  </ol>
);

const Disclosures = () => (
  <div>
    <h2 className="text-2xl font-semibold" data-testid="live-demo-title">Interactive EEG personalization demo <span className="pill bg-secondary text-foreground align-middle text-xs">Prepared-data fallback</span></h2>
    <p className="text-sm font-semibold mt-1" data-testid="live-demo-offline-note">Runs calibration and inference on prerecorded EEG processed offline.</p>
    <p className="text-sm text-muted-foreground mt-2 max-w-3xl">Runs the benchmark's pipelines on request. Personal calibration recenters the input covariances with a reference from the participant's own training session — input calibration, not model fine-tuning. Separate from the clinic's glucose change detection.</p>
    <ul className="text-xs mt-3 list-disc pl-5 text-muted-foreground space-y-0.5 max-w-3xl" data-testid="demo-disclosures">
      <li><b className="text-foreground">Complete-run zero-phase filtering:</b> 8–30 Hz filter applied forward and backward over each whole recorded run (not possible in real time).</li>
      <li><b className="text-foreground">Expert artifact exclusions:</b> trials flagged by the dataset's experts are removed from both sessions.</li>
      <li><b className="text-foreground">Full training session for calibration:</b> the reference uses all of the participant's artifact-free training-session trials.</li>
      <li>Precomputed per-session covariances are used for speed; the pipelines themselves are trained and run when you click.</li>
    </ul>
  </div>
);

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
  const ready = st.data && st.data.missing.length === 0;
  const s2 = cal.data ? "done" : ready ? "active" : "todo";
  const s3 = cmp.data ? "done" : ready && hasRef ? "active" : "todo";
  const d = cmp.data?.delta_accuracy_pp;
  const nodes = [
    ["participant", "Participant", st.loading ? `${pid} · checking…` : ready ? `${pid} · ${st.data.evaluation_session.trials} test trials` : st.data ? `${pid} · files missing` : pid, st.loading ? "run" : ready ? "done" : st.data ? "regress" : "todo"],
    ["calibration", "Calibration", cal.loading ? "Preparing…" : cal.data ? (cal.data.mode === "computed_now" ? `Computed now · ${cal.data.seconds} s` : "Loaded saved reference") : "Not prepared", cal.loading ? "run" : cal.data ? "done" : "todo"],
    ["comparison", "Comparison", cmp.loading ? "Running A and B…" : cmp.data ? "Computed now" : "Not run", cmp.loading ? "run" : cmp.data ? "done" : "todo"],
    ["evidence", "Evidence", cmp.data ? `${d < 0 ? "Regression" : d > 0 ? "Improvement" : "No change"} ${sgn(d)} pp` : "—", cmp.data ? (d < 0 ? "regress" : "done") : "todo"],
  ];
  return (
    <section className="panel p-5 sm:p-7 space-y-6" data-testid="live-demo">
      <Disclosures />
      <SignalPath nodes={nodes} />
      <ol className="space-y-7 border-t border-[var(--line)] pt-6">
        <Step n={1} state={ready ? "done" : "active"} title="Select participant" hint="Held-out participant from BCI Competition IV 2a (A01–A09)." testid="demo-step-select">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Demo participant">
            {PIDS.map((p) => (
              <button key={p} type="button" disabled={busy} aria-pressed={p === pid} onClick={() => setPid(p)} data-testid={`demo-select-${p}`}
                className={`relative mono text-sm px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${p === pid ? "text-background border-foreground" : "bg-card hover:bg-secondary"}`}>
                {p === pid && <motion.span layoutId="demo-pid-sel" className="absolute inset-0 rounded-[5px] bg-foreground" transition={{ duration: 0.2, ease: EASE }} aria-hidden />}
                <span className="relative">{p}</span></button>
            ))}
          </div>
          {st.loading && <div className="text-sm text-muted-foreground flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Checking prepared data…</div>}
          {st.error && <ErrorBox message={st.error} testid="demo-status-error" />}
          {st.data && st.data.missing.length > 0 && (
            <div role="alert" className="text-sm tag-change rounded-md p-3" data-testid="demo-missing">
              Prepared data for {pid} is incomplete, so nothing can be computed. Missing in <code>{st.data.artifacts_dir}</code>: <code>{st.data.missing.join(", ")}</code>. Run <code>python demo_cli.py prepare</code> in the research module to rebuild them.
            </div>
          )}
          {ready && <Sessions st={st.data} />}
        </Step>
        <Step n={2} state={s2} title="Prepare personal calibration" hint="Estimates the participant's reference from training-session EEG only; no labels are read." testid="demo-step-calibrate">
          {ready && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button className="max-sm:whitespace-normal max-sm:h-auto max-sm:py-2" disabled={busy} onClick={() => runCal(async () => (await api.post(`/research/demo/${pid}/calibrate`, null, { params: { recompute } })).data)} data-testid="demo-calibrate-button">
                  {cal.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden /> : <Crosshair className="h-4 w-4 mr-2" aria-hidden />}{cal.loading ? "Preparing…" : "Prepare personal calibration"}</Button>
                <label className="text-xs flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-[var(--teal)]" checked={recompute} onChange={(e) => setRecompute(e.target.checked)} data-testid="demo-recompute-checkbox" />Recompute even if a saved reference exists</label>
              </div>
              {cal.error && <ErrorBox message={cal.error} testid="demo-calibrate-error" />}
              {cal.data && <CalResult c={cal.data} />}
              {!cal.data && st.data.reference && <div className="text-xs text-muted-foreground" data-testid="demo-saved-reference">Saved reference available (computed {utc(st.data.reference.computed_at)}). Click “Prepare personal calibration” to load it, or tick recompute.</div>}
            </>
          )}
        </Step>
        <Step n={3} state={s3} title="Compare predictions" hint="Trains A and B on the 8 other participants, predicts the held-out evaluation trials, then scores them." testid="demo-step-compare">
          {ready && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button className="max-sm:whitespace-normal max-sm:h-auto max-sm:py-2" variant={hasRef ? "default" : "outline"} disabled={busy || !hasRef} onClick={() => runCmp(async () => (await api.post(`/research/demo/${pid}/compare`, null, { timeout: 200000 })).data)} data-testid="demo-compare-button">
                  {cmp.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden /> : <Play className="h-4 w-4 mr-2" aria-hidden />}{cmp.loading ? "Comparing…" : "Compare predictions"}</Button>
                {!hasRef && <span className="text-xs text-muted-foreground">No saved reference for {pid} yet — prepare calibration first.</span>}
              </div>
              {cmp.loading && (
                <div className="space-y-2" role="status" data-testid="demo-compare-loading">
                  <div className="h-1 w-full rounded-full bg-[var(--line)] overflow-hidden" aria-hidden><div className="h-full w-2/5 rounded-full bg-[var(--amber-line)] mg-scan" /></div>
                  <div className="text-sm text-muted-foreground">Training both pipelines on the 8 other participants and predicting {pid}'s evaluation trials… this usually takes 10–20 s. The bar shows the request is in flight, not a percentage.</div>
                </div>
              )}
              {cmp.error && <ErrorBox message={cmp.error} testid="demo-compare-error" />}
              {cmp.data && <Results r={cmp.data} Matrix={Matrix} classes={classes} />}
            </>
          )}
        </Step>
      </ol>
    </section>
  );
};
