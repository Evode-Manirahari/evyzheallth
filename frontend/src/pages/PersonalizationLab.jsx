import { useMemo, useState } from "react";
import { FlaskConical, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useFetch } from "../lib/api";
import { Loading, ErrorBox } from "../components/StateViews";
import { LiveDemo } from "../components/LiveDemo";
import { UploadDemo } from "../components/UploadDemo";
import { DeltaBar, SectionRule, EASE } from "../components/Micro";

const CLASSES = ["Left hand", "Right hand", "Feet", "Tongue"];
const pctTxt = (x) => `${(x * 100).toFixed(1)}%`;
const pp = (d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d * 100).toFixed(1)} pp`;

const Matrix = ({ title, m, testid }) => {
  const max = Math.max(...m.flat());
  return (
    <div className="min-w-0 overflow-x-auto" data-testid={testid}>
      <div className="text-sm font-medium mb-2">{title}</div>
      <table className="text-xs mono border-collapse">
        <thead><tr><th className="p-1 text-left font-sans text-muted-foreground">True ↓ / Pred →</th>{CLASSES.map((c) => <th key={c} className="p-1 font-sans font-normal text-muted-foreground">{c}</th>)}</tr></thead>
        <tbody>{m.map((row, i) => (
          <tr key={i}><th className="p-1 text-left font-sans font-normal text-muted-foreground">{CLASSES[i]}</th>
            {row.map((v, j) => (
              <td key={j} className={`p-1 w-14 text-center border ${i === j ? "font-semibold" : ""}`} style={{ background: `rgba(15,118,110,${max ? (v / max) * 0.45 : 0})` }}>{v}</td>
            ))}</tr>
        ))}</tbody>
      </table>
    </div>
  );
};

const Conditions = ({ d }) => (
  <div className="panel p-5 text-sm" data-testid="lab-offline-conditions">
    <div className="font-semibold">Offline evaluation conditions</div>
    <ul className="list-disc pl-5 mt-1 space-y-0.5 text-muted-foreground">
      <li><b className="text-foreground">Zero-phase filtering:</b> {d.settings.bandpass_hz[0]}–{d.settings.bandpass_hz[1]} Hz band-pass applied forward and backward over each complete recorded run, including evaluation runs. This is not possible in real time.</li>
      <li><b className="text-foreground">Expert artifact exclusions:</b> trials flagged by the dataset's experts were removed from both sessions before scoring.</li>
      <li><b className="text-foreground">Full-session calibration:</b> each held-out participant's whole training session (all artifact-free trials, labels unused) is required to estimate the recentering reference before testing.</li>
    </ul>
  </div>
);

const Summary = ({ s, n }) => {
  const a = s.A_no_alignment, b = s.B_recentered;
  return (
    <div className="grid sm:grid-cols-2 gap-4" data-testid="lab-summary">
      {[["Mean accuracy", "accuracy", true], ["Mean macro-F1", "macro_f1", false]].map(([label, k, isPct]) => (
        <div key={k} className="panel p-5">
          <div className="eyebrow">{label} · {n} held-out participants</div>
          <div className="figure text-4xl sm:text-5xl mt-3" data-testid={`lab-mean-${k}`}>
            {isPct ? pctTxt(a[k]) : a[k].toFixed(3)} <span className="text-muted-foreground text-base">→</span> {isPct ? pctTxt(b[k]) : b[k].toFixed(3)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">A no alignment → B recentered · change <span className="mono" data-testid={`lab-mean-${k}-delta`}>{isPct ? pp(b[k] - a[k]) : `${b[k] - a[k] > 0 ? "+" : ""}${(b[k] - a[k]).toFixed(3)}`}</span>{isPct ? " (chance 25%)" : ""}</div>
        </div>
      ))}
    </div>
  );
};

const DeltaStrip = ({ folds, selected, onSelect }) => {
  const max = Math.max(...folds.map((f) => Math.abs(f.delta_accuracy_B_minus_A))) * 100;
  return (
    <div className="panel p-4 sm:p-5" data-testid="lab-delta-strip">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold">Change in accuracy per held-out participant <span className="font-normal text-muted-foreground">(B − A, pp) · select to inspect</span></h3>
        <span className="text-xs text-muted-foreground flex gap-3"><span><i className="inline-block w-3 h-2 rounded-[2px] bg-[var(--regress)] mg-hatch align-middle mr-1" />Regression (left)</span><span><i className="inline-block w-3 h-2 rounded-[2px] bg-[var(--teal)] align-middle mr-1" />Improved (right)</span></span>
      </div>
      <ul className="space-y-0.5" role="group" aria-label="Held-out participant">
        {folds.map((f) => {
          const d = f.delta_accuracy_B_minus_A * 100, reg = d < 0, on = f.target === selected;
          return (
            <li key={f.target}>
              <button type="button" aria-pressed={on} onClick={() => onSelect(f.target)} data-testid={`lab-select-${f.target}`} aria-label={`${f.target}: ${reg ? "regression" : "improved"} ${pp(f.delta_accuracy_B_minus_A)}`}
                className="relative w-full grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3.5rem_1fr_5rem_7rem] items-center gap-x-3 gap-y-1 px-2 py-1.5 rounded-md text-sm hover:bg-[var(--paper)] transition-colors">
                {on && <motion.span layoutId="lab-fold-sel" className="absolute inset-0 rounded-md bg-[var(--teal-soft)]" transition={{ duration: 0.22, ease: EASE }} aria-hidden />}
                <span className="relative mono font-semibold text-left">{f.target}</span>
                <span className="relative max-sm:col-span-3 max-sm:row-start-2"><DeltaBar value={d} max={max} label={`${pp(f.delta_accuracy_B_minus_A)}`} /></span>
                <span className={`relative mono font-semibold text-right ${reg ? "text-[var(--regress)]" : "text-[var(--teal)]"}`}>{pp(f.delta_accuracy_B_minus_A)}</span>
                <span className={`relative text-xs font-semibold flex items-center gap-1 ${reg ? "text-[var(--regress)]" : "text-[var(--teal)]"}`}>{reg ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : <TrendingUp className="h-3.5 w-3.5" aria-hidden />}{reg ? "Regression" : "Improved"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const FoldTable = ({ folds, selected, onSelect }) => (
  <div className="panel overflow-x-auto">
    <table className="w-full text-sm" data-testid="lab-fold-table">
      <thead className="text-left"><tr className="eyebrow">
        <th className="px-3 py-2">Held-out</th><th className="px-3 py-2">A accuracy</th><th className="px-3 py-2">B accuracy</th><th className="px-3 py-2">Change</th>
        <th className="px-3 py-2">A macro-F1</th><th className="px-3 py-2">B macro-F1</th><th className="px-3 py-2">Calibration / test trials</th></tr></thead>
      <tbody>{folds.map((f) => {
        const reg = f.delta_accuracy_B_minus_A < 0;
        return (
          <tr key={f.target} className={`border-t border-[var(--line)] cursor-pointer hover:bg-[var(--paper)] ${selected === f.target ? "bg-[var(--teal-soft)]/60" : ""}`} onClick={() => onSelect(f.target)} data-testid={`lab-row-${f.target}`}>
            <td className="px-3 py-2"><button type="button" className="mono font-semibold underline-offset-2 hover:underline" onClick={() => onSelect(f.target)}>{f.target}</button>
              {reg ? <span className="ml-2 pill tag-regress" data-testid={`lab-regression-${f.target}`}><TrendingDown className="h-3 w-3" aria-hidden />Regression</span>
                : <span className="ml-2 pill tag-ok"><TrendingUp className="h-3 w-3" aria-hidden />Improved</span>}</td>
            <td className="px-3 py-2 mono">{pctTxt(f.A_no_alignment.accuracy)}</td>
            <td className="px-3 py-2 mono">{pctTxt(f.B_recentered.accuracy)}</td>
            <td className={`px-3 py-2 mono font-semibold ${reg ? "text-[var(--regress)]" : "text-[var(--teal)]"}`}>{pp(f.delta_accuracy_B_minus_A)}</td>
            <td className="px-3 py-2 mono">{f.A_no_alignment.macro_f1.toFixed(3)}</td>
            <td className="px-3 py-2 mono">{f.B_recentered.macro_f1.toFixed(3)}</td>
            <td className="px-3 py-2 mono">{f.calibration_trials_unlabeled} / {f.test_trials}</td>
          </tr>
        );
      })}</tbody>
    </table>
  </div>
);

const FoldDetail = ({ f }) => (
  <div className="panel p-5 space-y-4" data-testid="lab-fold-detail">
    <div className="flex flex-wrap items-baseline gap-3">
      <h2 className="font-semibold">Held-out participant <span className="mono" data-testid="lab-selected-id">{f.target}</span></h2>
      <span className="text-xs text-muted-foreground">trained on {f.sources.join(", ")} · {f.source_training_trials} source trials · {f.calibration_trials_unlabeled} unlabeled calibration trials (training session) · {f.test_trials} test trials (evaluation session)</span>
    </div>
    {f.delta_accuracy_B_minus_A < 0 && (
      <div className="text-sm tag-regress rounded-md p-3 flex items-center gap-2" data-testid="lab-detail-regression"><AlertTriangle className="h-4 w-4" aria-hidden />Regression: recentering lowered accuracy by {pp(-f.delta_accuracy_B_minus_A).replace("+", "")} for this participant.</div>
    )}
    <div className="grid md:grid-cols-2 gap-6">
      <Matrix title={`A · no alignment — ${pctTxt(f.A_no_alignment.accuracy)}, macro-F1 ${f.A_no_alignment.macro_f1.toFixed(3)}`} m={f.A_no_alignment.confusion_matrix} testid="lab-cm-a" />
      <Matrix title={`B · recentered — ${pctTxt(f.B_recentered.accuracy)}, macro-F1 ${f.B_recentered.macro_f1.toFixed(3)}`} m={f.B_recentered.confusion_matrix} testid="lab-cm-b" />
    </div>
    <p className="text-xs text-muted-foreground">Both pipelines are scored on the identical evaluation-session trials and labels. Both are always shown; no pipeline is selected per participant.</p>
  </div>
);

const Method = ({ d }) => {
  const s = d.settings;
  return (
    <div className="panel p-5 text-sm space-y-2" data-testid="lab-method">
      <div className="font-semibold">Fixed settings (chosen a priori, never tuned on target data)</div>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
        <li>{s.eeg_channels} EEG channels (EOG excluded) · {s.bandpass_hz[0]}–{s.bandpass_hz[1]} Hz band-pass ({s.filter}) · epoch {s.epoch_window_s_after_cue[0]}–{s.epoch_window_s_after_cue[1]} s after cue · {s.covariance_estimator.toUpperCase()} covariance · {s.classifier}.</li>
        <li>Expert-marked artifact trials (dataset annotations) are excluded in both sessions; remaining counts appear per participant above.</li>
        <li>Leave-one-participant-out: sources are the other eight participants' labeled training sessions, each recentered with its own training-session mean (pipeline B).</li>
        <li>Calibration requires the held-out participant's <b>full training session</b> (all of its artifact-free trials, labels unused) to estimate the reference; the evaluation session is used only for final scoring.</li>
        <li>Library versions: {Object.entries(d.versions).map(([k, v]) => `${k} ${v}`).join(" · ")} · seed {s.seed} · generated {d.generated_at.slice(0, 10)} from <span className="mono">{d.source_file}</span>.</li>
      </ul>
      <p className="text-xs text-muted-foreground">Data: BCI Competition IV 2a via BNCI Horizon 2020 (001-2014, CC BY-ND 4.0). Separate research namespace <span className="mono">{d.namespace}</span>; not linked to clinic participants or wearable-event detection. No significance testing was performed.</p>
    </div>
  );
};

export default function PersonalizationLab() {
  const { data, error, loading, reload } = useFetch("/research/eeg-calibration");
  const [sel, setSel] = useState("A01");
  const fold = useMemo(() => data?.folds.find((f) => f.target === sel) || data?.folds[0], [data, sel]);
  return (
    <div className="space-y-8">
      <div className="rounded-[8px] bg-[var(--ink)] text-[var(--surface)] px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="lab-research-band">
        <FlaskConical className="h-4 w-4 text-[var(--amber-line)]" aria-hidden />
        <span className="font-semibold">Research demonstration</span>
        <span className="opacity-85">Separate from clinic participants, glucose change detection and reviews. Public EEG dataset only.</span>
      </div>
      <div>
        <h1 className="display text-4xl sm:text-5xl">Cross-participant EEG calibration</h1>
        <p className="mt-3 pill tag-change !whitespace-normal" data-testid="lab-label">Exploratory EEG benchmark — calibration, not fine-tuning; no clinical validation.</p>
        <p className="text-base text-muted-foreground mt-3 max-w-3xl">Pipeline A: one shared covariance-based minimum-distance-to-mean classifier. Pipeline B: the same classifier with participant-specific Riemannian recentering (unsupervised reference from calibration data).</p>
      </div>
      <UploadDemo Matrix={Matrix} classes={CLASSES} />
      <LiveDemo Matrix={Matrix} classes={CLASSES} />
      {loading && <Loading />}
      {error && <ErrorBox message={`Benchmark results unavailable: ${error}`} onRetry={reload} testid="lab-unavailable" />}
      {data && fold && (
        <>
          <div className="pt-6 space-y-3">
            <SectionRule index="E" label="Saved benchmark" meta="results file · 9 folds" testid="lab-saved-rule" />
            <h2 className="text-2xl font-semibold" data-testid="saved-benchmark-heading">Saved benchmark results <span className="pill bg-secondary text-foreground align-middle ml-1">Loaded from the results file, not recomputed</span></h2>
          </div>
          <Summary s={data.summary} n={data.folds.length} />
          <p className="text-xs text-muted-foreground" data-testid="lab-pp-note">Percentage-point (pp) changes are computed from the unrounded stored values, so they can differ by 0.1 pp from subtracting the rounded percentages shown.</p>
          <Conditions d={data} />
          <div className="text-sm flex flex-wrap items-center gap-2" data-testid="lab-regressions-summary">
            <span className="pill tag-regress"><TrendingDown className="h-3.5 w-3.5" aria-hidden />Regressions: {data.summary.regressions.join(", ") || "none"}</span>
            <span className="pill tag-ok"><TrendingUp className="h-3.5 w-3.5" aria-hidden />Improved: {data.summary.improved.join(", ") || "none"}</span>
          </div>
          <DeltaStrip folds={data.folds} selected={fold.target} onSelect={setSel} />
          <FoldDetail f={fold} />
          <FoldTable folds={data.folds} selected={fold.target} onSelect={setSel} />
          <Method d={data} />
        </>
      )}
    </div>
  );
}
