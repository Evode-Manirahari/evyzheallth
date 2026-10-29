import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, XCircle, Circle, Play, RotateCcw } from "lucide-react";
import { useApi, errMsg } from "../lib/api";
import { Button } from "./ui/button";
import { ErrorBox } from "./StateViews";
import { Results } from "./LiveDemo";

const CHUNK = 4 * 1024 * 1024;
const PIDS = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09"];
const ROLES = [["calibration", "T", "Calibration recording — training session", "Used only to estimate the personal reference; its labels are discarded during preprocessing."],
  ["evaluation", "E", "Evaluation recording — separate session", "Predicted by both pipelines; its labels stay sealed until after prediction, for scoring only."]];
const STAGES = [["validate", "Validate recordings"], ["preprocess", "Preprocess and compute covariances"], ["calibrate", "Compute personal calibration"], ["predict", "Predict evaluation trials (A and B)"], ["compare", "Score and compare"]];
const detail = (e) => e?.response?.data?.detail?.message || errMsg(e);

const StageList = ({ st }) => (
  <ol className="space-y-2" data-testid="upload-stages" aria-live="polite">
    {STAGES.map(([k, label]) => {
      const s = st.stages.find((x) => x.key === k);
      const state = s?.state || (st.state === "failed" ? "skipped" : "waiting");
      const Icon = state === "done" ? CheckCircle2 : state === "running" ? Loader2 : state === "failed" ? XCircle : Circle;
      return (
        <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm" data-testid={`upload-stage-${k}`} data-state={state}>
          <Icon className={`h-4 w-4 shrink-0 ${state === "done" ? "text-[var(--teal)]" : state === "running" ? "animate-spin text-[var(--amber)]" : state === "failed" ? "text-[var(--regress)]" : "text-muted-foreground"}`} aria-hidden />
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground mono">{state === "done" ? `${s.seconds.toFixed(2)} s` : state === "running" ? "running…" : state === "failed" ? "failed" : state === "skipped" ? "not run" : "waiting"}</span>
        </li>
      );
    })}
  </ol>
);

const Validation = ({ v }) => (
  <dl className="grid sm:grid-cols-2 gap-3 text-xs" data-testid="upload-validation">
    {ROLES.map(([role]) => v[role] && (
      <div key={role} className="rounded-md bg-[var(--paper)] p-3">
        <dt className="font-semibold text-foreground">{role === "calibration" ? "Calibration" : "Evaluation"} · {v[role].file}</dt>
        <dd className="text-muted-foreground mt-1">{(v[role].bytes / 1e6).toFixed(1)} MB · {v[role].channels} channels · {v[role].fs} Hz · {v[role].task_runs} task runs · {v[role].trials} trials ({v[role].artifact_trials} expert-flagged) · official checksum: {v[role].official_checksum}</dd>
      </div>
    ))}
  </dl>
);

const FilePick = ({ role, sess, title, hint, pid, file, setFile, progress, disabled }) => (
  <div className="space-y-1.5">
    <label htmlFor={`upload-${role}`} className="text-sm font-medium block">{title} <span className="text-muted-foreground font-normal">(expected {pid}{sess}.mat)</span></label>
    <input id={`upload-${role}`} type="file" accept=".mat" disabled={disabled} onChange={(e) => setFile(e.target.files[0] || null)} data-testid={`upload-input-${role}`}
      className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
    <p className="text-xs text-muted-foreground">{hint}</p>
    {file && (
      <div className="text-xs mono" data-testid={`upload-progress-${role}`}>
        {file.name} · {(file.size / 1e6).toFixed(1)} MB · {progress == null ? "not uploaded" : progress >= 1 ? "uploaded" : `uploading ${(progress * 100).toFixed(0)}%`}
        <div className="h-1 mt-1 rounded-full bg-[var(--line)] overflow-hidden" aria-hidden><div className="h-full bg-[var(--teal)] origin-left transition-transform" style={{ transform: `scaleX(${progress || 0})` }} /></div>
      </div>
    )}
  </div>
);

export const UploadDemo = ({ Matrix, classes }) => {
  const api = useApi();
  const [pid, setPid] = useState("A01");
  const [files, setFiles] = useState({});
  const [progress, setProgress] = useState({});
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);
  const [st, setSt] = useState(null);
  const [uploadSecs, setUploadSecs] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const busy = phase === "uploading" || phase === "processing";

  const poll = (id) => {
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/research/uploads/${id}`);
        setSt(data);
        if (data.state === "done" || data.state === "failed") setPhase(data.state);
        else poll(id);
      } catch (e) { setError(detail(e)); setPhase("failed"); }
    }, 600);
  };

  const run = async () => {
    setError(null); setSt(null); setProgress({}); setPhase("uploading");
    const t0 = performance.now();
    try {
      const { data: job } = await api.post("/research/uploads", { participant: pid });
      for (const [role] of ROLES) {
        const f = files[role], total = Math.max(1, Math.ceil(f.size / CHUNK));
        for (let i = 0; i < total; i += 1) {
          await api.put(`/research/uploads/${job.id}/files/${role}`, f.slice(i * CHUNK, (i + 1) * CHUNK),
            { params: { index: i, total, filename: f.name }, headers: { "Content-Type": "application/octet-stream" }, timeout: 120000 });
          setProgress((p) => ({ ...p, [role]: (i + 1) / total }));
        }
      }
      setUploadSecs((performance.now() - t0) / 1000);
      setPhase("processing");
      await api.post(`/research/uploads/${job.id}/process`);
      poll(job.id);
    } catch (e) { setError(detail(e)); setPhase("failed"); }
  };

  const runSample = async () => {
    setError(null); setSt(null); setProgress({}); setUploadSecs(null); setPid("A01"); setPhase("processing");
    try {
      const { data } = await api.post("/research/uploads/sample", null, { timeout: 120000 });
      poll(data.id);
    } catch (e) { setError(detail(e)); setPhase("failed"); }
  };

  const reset = () => { clearTimeout(timer.current); setFiles({}); setProgress({}); setSt(null); setError(null); setPhase("idle"); setUploadSecs(null); setInputKey((k) => k + 1); };

  return (
    <section className="panel p-5 sm:p-7 space-y-6" data-testid="upload-demo">
      <div>
        <h2 className="text-2xl font-semibold">Upload recordings and run the pipeline</h2>
        <p className="text-sm font-semibold mt-1">Runs calibration and inference on prerecorded EEG processed offline.</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">Upload raw BNCI Horizon 001-2014 MAT recordings for one held-out participant. Their covariances, personal calibration reference and predictions are generated from the uploaded files only; no precomputed target data is used. The A and B source models are prepared beforehand from the other eight participants and exclude the uploaded participant. Filtering runs over each whole recorded run (zero-phase) and expert-flagged trials are excluded, as in the benchmark.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="upload-pid" className="text-sm font-medium">Participant</label>
        <select id="upload-pid" value={pid} disabled={busy} onChange={(e) => { setPid(e.target.value); reset(); }} className="h-9 rounded-md border bg-card px-2 mono text-sm" data-testid="upload-participant-select">
          {PIDS.map((p) => <option key={p} value={p}>{p}{p === "A01" ? " (source models prepared)" : ""}</option>)}
        </select>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {ROLES.map(([role, sess, title, hint]) => (
          <FilePick key={`${role}-${inputKey}`} role={role} sess={sess} title={title} hint={hint} pid={pid} file={files[role]} progress={progress[role]} disabled={busy || phase === "done"}
            setFile={(f) => setFiles((x) => ({ ...x, [role]: f }))} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || phase === "done" || !files.calibration || !files.evaluation} onClick={run} className="max-sm:whitespace-normal max-sm:h-auto max-sm:py-2" data-testid="upload-run-button">
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden /> : <Play className="h-4 w-4 mr-2" aria-hidden />}
          {phase === "uploading" ? "Uploading…" : phase === "processing" ? "Processing…" : "Upload and process"}</Button>
        <Button variant="outline" disabled={busy || phase === "done"} onClick={runSample} className="max-sm:whitespace-normal max-sm:h-auto max-sm:py-2" data-testid="upload-sample-button">
          <Play className="h-4 w-4 mr-2" aria-hidden />Use sample recordings — A01</Button>
        {(phase === "done" || phase === "failed") && <Button variant="outline" onClick={reset} data-testid="upload-reset-button"><RotateCcw className="h-4 w-4 mr-2" aria-hidden />New upload</Button>}
        {!files.calibration || !files.evaluation ? <span className="text-xs text-muted-foreground"><Upload className="inline h-3.5 w-3.5 mr-1" aria-hidden />Choose both recordings to start.</span> : null}
      </div>
      {error && <ErrorBox message={error} testid="upload-error" />}
      {st?.input === "server_sample" && <p className="text-sm font-semibold rounded-md tag-change px-3 py-2" data-testid="upload-sample-label">{st.label}</p>}
      {st && (
        <div className="space-y-4">
          <StageList st={st} />
          {st.state === "failed" && st.error && <ErrorBox message={st.error} testid="upload-job-error" />}
          {st.stages.find((s) => s.key === "validate")?.detail && <Validation v={st.stages.find((s) => s.key === "validate").detail} />}
          {st.state === "done" && (
            <div className="text-sm" data-testid="upload-timing">
              <span className="pill tag-ok mr-2">{st.input === "server_sample" ? "Computed now from server sample recordings" : "Computed now from uploaded files"}</span>
              {uploadSecs != null && <>upload {uploadSecs.toFixed(1)} s · </>}processing {st.total_seconds?.toFixed(2)} s on the server · benchmark match: <b>{st.result.benchmark_check.pass ? "yes" : "NO"}</b>
            </div>
          )}
        </div>
      )}
      {st?.state === "done" && <Results r={st.result} Matrix={Matrix} classes={classes} />}
    </section>
  );
};
