"""Interactive demo backend (invoked by the EVYZ API as a subprocess). Reuses pipeline.py unchanged in protocol.

Commands (JSON to stdout):
  prepare               build per-session covariance artifacts (labels stored in separate files)
  status <S>            what exists for participant S
  calibrate <S> [--recompute]   reference = Riemannian mean of S's training-session covariances (no labels read)
  compare <S>           train A/B on the 8 source training sessions, predict S's evaluation trials, then score
  sources <S>           fit A/B source models on the 8 other participants' training sessions (S excluded) and save them
  job <dir> <S>         upload onboarding: validate -> preprocess -> calibrate -> predict -> compare, from the uploaded
                        calibration.mat / evaluation.mat only (no precomputed target artifacts); writes status.json
"""
import hashlib
import json
import pickle
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from pyriemann.classification import MDM
from pyriemann.utils.base import invsqrtm
from pyriemann.utils.mean import mean_riemann
from scipy.io import loadmat

import data
import pipeline

ART = data.RAW_DIR / "artifacts"
BENCH = Path(__file__).parent / "results" / "loso_all.json"
SUMS = Path(__file__).parent / "SHA256SUMS.txt"
TOLERANCE = 1e-4  # benchmark JSON stores metrics rounded to 4 decimals


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()[:16]


def cov_file(s, sess):
    return ART / f"covs_{s}{sess}.npz"


def label_file(s, sess):
    return ART / f"labels_{s}{sess}.npz"


def ref_file(s):
    return ART / f"calref_{s}.npz"


def required(s):
    sources = [o for o in data.SUBJECTS if o != s]
    need = [cov_file(s, "T"), cov_file(s, "E"), label_file(s, "E")]
    need += [p for o in sources for p in (cov_file(o, "T"), label_file(o, "T"))]
    return [p.name for p in need if not p.exists()]


def prepare():
    ART.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    for s in data.SUBJECTS:
        for sess in ("T", "E"):
            X, y, ids = pipeline.epochs(s, sess, return_ids=True)
            np.savez(cov_file(s, sess), C=pipeline.covs(X), trial_ids=np.array(ids))
            np.savez(label_file(s, sess), y=y)
    manifest = {"created_at": now(), "seconds": round(time.time() - t0, 1), "settings": pipeline.SETTINGS}
    (ART / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return {"ok": True, **manifest}


def status(s):
    miss = required(s)
    out = {"participant": s, "missing": miss, "artifacts_dir": str(ART)}
    if (ART / "manifest.json").exists():
        out["artifacts_created_at"] = json.loads((ART / "manifest.json").read_text())["created_at"]
    if not miss:
        out["calibration_session"] = {"session": "T", "description": data.SESSIONS["T"], "trials": int(len(np.load(cov_file(s, "T"))["trial_ids"]))}
        out["evaluation_session"] = {"session": "E", "description": data.SESSIONS["E"], "trials": int(len(np.load(cov_file(s, "E"))["trial_ids"]))}
    if ref_file(s).exists():
        r = np.load(ref_file(s))
        out["reference"] = {"computed_at": str(r["computed_at"]), "n_trials": int(r["n_trials"]), "reference_sha": sha(r["M"])}
    return out


def calibrate(s, recompute):
    miss = [m for m in required(s) if m.startswith(f"covs_{s}T")]
    if miss:
        return {"error": "missing_artifacts", "missing": miss}
    if ref_file(s).exists() and not recompute:
        r = np.load(ref_file(s))
        return {"participant": s, "mode": "loaded", "computed_at": str(r["computed_at"]), "n_trials": int(r["n_trials"]),
                "reference_sha": sha(r["M"]), "input_sha": str(r["input_sha"]), "labels_read": False}
    C = np.load(cov_file(s, "T"))["C"]  # label file is never opened here
    t0 = time.perf_counter()
    M = mean_riemann(C)
    secs = time.perf_counter() - t0
    ts = now()
    np.savez(ref_file(s), M=M, n_trials=len(C), computed_at=ts, input_sha=sha(C))
    return {"participant": s, "mode": "computed_now", "computed_at": ts, "seconds": round(secs, 3), "n_trials": int(len(C)),
            "reference_sha": sha(M), "input_sha": sha(C), "labels_read": False}


def compare(s):
    miss = required(s)
    if miss:
        return {"error": "missing_artifacts", "missing": miss}
    if not ref_file(s).exists():
        return {"error": "no_calibration", "missing": [ref_file(s).name]}
    t0 = time.perf_counter()
    ref = np.load(ref_file(s))
    M = ref["M"].copy()
    sha_before = sha(M)
    sources = [o for o in data.SUBJECTS if o != s]
    Cs = {o: np.load(cov_file(o, "T"))["C"] for o in sources}
    ys = {o: np.load(label_file(o, "T"))["y"] for o in sources}
    clf_a = MDM(metric="riemann").fit(np.concatenate([Cs[o] for o in sources]), np.concatenate([ys[o] for o in sources]))
    clf_b = MDM(metric="riemann").fit(np.concatenate([pipeline.recenter(Cs[o], Cs[o]) for o in sources]),
                                      np.concatenate([ys[o] for o in sources]))
    t_train = time.perf_counter()
    ev = np.load(cov_file(s, "E"))
    C_test, ids = ev["C"], [str(i) for i in ev["trial_ids"]]
    W = invsqrtm(M)
    pred_a = clf_a.predict(C_test)
    pred_b = clf_b.predict(W @ C_test @ W.T)
    t_pred = time.perf_counter()
    sha_after_mem, sha_after_disk = sha(M), sha(np.load(ref_file(s))["M"])
    y = np.load(label_file(s, "E"))["y"]  # opened only now, for scoring
    res_a, res_b = pipeline.metrics(y, pred_a), pipeline.metrics(y, pred_b)
    acc_a, acc_b = float(np.mean(pred_a == y)), float(np.mean(pred_b == y))
    bench = next(f for f in json.loads(BENCH.read_text())["folds"] if f["target"] == s)
    check = {
        "tolerance": TOLERANCE,
        "A_accuracy_diff": round(abs(res_a["accuracy"] - bench["A_no_alignment"]["accuracy"]), 6),
        "B_accuracy_diff": round(abs(res_b["accuracy"] - bench["B_recentered"]["accuracy"]), 6),
        "A_macro_f1_diff": round(abs(res_a["macro_f1"] - bench["A_no_alignment"]["macro_f1"]), 6),
        "B_macro_f1_diff": round(abs(res_b["macro_f1"] - bench["B_recentered"]["macro_f1"]), 6),
        "confusion_matrices_identical": res_a["confusion_matrix"] == bench["A_no_alignment"]["confusion_matrix"]
        and res_b["confusion_matrix"] == bench["B_recentered"]["confusion_matrix"],
        "test_trials_identical": len(y) == bench["test_trials"],
    }
    check["pass"] = all(v <= TOLERANCE for k, v in check.items() if k.endswith("_diff")) and check["confusion_matrices_identical"] and check["test_trials_identical"]
    trials = [{"id": i, "true": int(t), "a": int(pa), "b": int(pb)} for i, t, pa, pb in zip(ids, y, pred_a, pred_b)]
    return {
        "participant": s, "mode": "computed_now", "computed_at": now(),
        "seconds": {"train_sources": round(t_train - t0, 2), "predict": round(t_pred - t_train, 3), "total": round(time.perf_counter() - t0, 2)},
        "sources": sources, "source_training_trials": int(sum(len(v) for v in ys.values())),
        "calibration": {"computed_at": str(ref["computed_at"]), "n_trials": int(ref["n_trials"]), "reference_sha": sha_before},
        "reference_unchanged_after_inference": sha_before == sha_after_mem == sha_after_disk,
        "labels_used_for": "scoring only (loaded after both pipelines predicted)",
        "A_no_alignment": {**res_a, "correct": int((pred_a == y).sum()), "accuracy_unrounded": acc_a},
        "B_recentered": {**res_b, "correct": int((pred_b == y).sum()), "accuracy_unrounded": acc_b},
        "delta_accuracy_pp": (acc_b - acc_a) * 100,
        "trial_changes": {"fixed_by_B": int(((pred_a != y) & (pred_b == y)).sum()), "broken_by_B": int(((pred_a == y) & (pred_b != y)).sum()),
                          "both_correct": int(((pred_a == y) & (pred_b == y)).sum()), "both_wrong": int(((pred_a != y) & (pred_b != y)).sum())},
        "benchmark_check": check, "trials": trials,
    }


def benchmark_check(s, res_a, res_b, n_test):
    bench = next(f for f in json.loads(BENCH.read_text())["folds"] if f["target"] == s)
    check = {
        "tolerance": TOLERANCE,
        "A_accuracy_diff": round(abs(res_a["accuracy"] - bench["A_no_alignment"]["accuracy"]), 6),
        "B_accuracy_diff": round(abs(res_b["accuracy"] - bench["B_recentered"]["accuracy"]), 6),
        "A_macro_f1_diff": round(abs(res_a["macro_f1"] - bench["A_no_alignment"]["macro_f1"]), 6),
        "B_macro_f1_diff": round(abs(res_b["macro_f1"] - bench["B_recentered"]["macro_f1"]), 6),
        "confusion_matrices_identical": res_a["confusion_matrix"] == bench["A_no_alignment"]["confusion_matrix"]
        and res_b["confusion_matrix"] == bench["B_recentered"]["confusion_matrix"],
        "test_trials_identical": n_test == bench["test_trials"],
    }
    check["pass"] = all(v <= TOLERANCE for k, v in check.items() if k.endswith("_diff")) and check["confusion_matrices_identical"] and check["test_trials_identical"]
    return check


def scored(pred_a, pred_b, y):
    res_a, res_b = pipeline.metrics(y, pred_a), pipeline.metrics(y, pred_b)
    acc_a, acc_b = float(np.mean(pred_a == y)), float(np.mean(pred_b == y))
    return {
        "A_no_alignment": {**res_a, "correct": int((pred_a == y).sum()), "accuracy_unrounded": acc_a},
        "B_recentered": {**res_b, "correct": int((pred_b == y).sum()), "accuracy_unrounded": acc_b},
        "delta_accuracy_pp": (acc_b - acc_a) * 100,
        "trial_changes": {"fixed_by_B": int(((pred_a != y) & (pred_b == y)).sum()), "broken_by_B": int(((pred_a == y) & (pred_b != y)).sum()),
                          "both_correct": int(((pred_a == y) & (pred_b == y)).sum()), "both_wrong": int(((pred_a != y) & (pred_b != y)).sum())},
    }


def source_model_file(s):
    return ART / f"source_models_excl_{s}.pkl"


def sources(s):
    srcs = [o for o in data.SUBJECTS if o != s]
    miss = [p.name for o in srcs for p in (cov_file(o, "T"), label_file(o, "T")) if not p.exists()]
    if miss:
        return {"error": "missing_artifacts", "missing": miss}
    t0 = time.perf_counter()
    Cs = {o: np.load(cov_file(o, "T"))["C"] for o in srcs}
    ys = {o: np.load(label_file(o, "T"))["y"] for o in srcs}
    clf_a = MDM(metric="riemann").fit(np.concatenate([Cs[o] for o in srcs]), np.concatenate([ys[o] for o in srcs]))
    clf_b = MDM(metric="riemann").fit(np.concatenate([pipeline.recenter(Cs[o], Cs[o]) for o in srcs]), np.concatenate([ys[o] for o in srcs]))
    meta = {"excluded_participant": s, "sources": srcs, "source_training_trials": int(sum(len(v) for v in ys.values())),
            "trained_at": now(), "seconds": round(time.perf_counter() - t0, 2), "settings": pipeline.SETTINGS}
    assert s not in meta["sources"]
    source_model_file(s).write_bytes(pickle.dumps({"A": clf_a, "B": clf_b, "meta": meta}))
    return {"ok": True, "file": source_model_file(s).name, **{k: v for k, v in meta.items() if k != "settings"}}


OFFICIAL = {line.split()[0]: line.split()[1] for line in SUMS.read_text().splitlines() if line.strip()} if SUMS.exists() else {}


def validate_mat(path, s, sess):
    """Structure checks for a BNCI 001-2014 recording. Raises ValueError with a readable message."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    official = OFFICIAL.get(digest)
    if official and official != f"{s}{sess}.mat":
        raise ValueError(f"This file is the official {official}, but it was uploaded as {s}{sess}.mat ({data.SESSIONS[sess]}).")
    try:
        m = loadmat(path, squeeze_me=True, struct_as_record=False)
    except Exception as e:
        raise ValueError(f"Not a readable MATLAB file: {e}")
    if "data" not in m:
        raise ValueError("MATLAB file has no 'data' variable; expected the BNCI Horizon 001-2014 release format.")
    runs = np.atleast_1d(m["data"])
    for r in runs:
        for f in ("X", "trial", "y", "fs", "artifacts", "classes"):
            if not hasattr(r, f):
                raise ValueError(f"Run is missing field '{f}'; expected the BNCI Horizon 001-2014 release format.")
    task = [r for r in runs if np.atleast_1d(r.trial).size]
    chans = {int(np.asarray(r.X).shape[1]) for r in runs}
    fs = {int(r.fs) for r in runs}
    n = int(sum(np.atleast_1d(r.trial).size for r in task))
    ys = np.concatenate([np.atleast_1d(r.y) for r in task]) if task else np.array([])
    if chans != {25}:
        raise ValueError(f"Expected 25 channels (22 EEG + 3 EOG), found {sorted(chans)}.")
    if fs != {data.FS_EXPECTED}:
        raise ValueError(f"Expected {data.FS_EXPECTED} Hz sampling, found {sorted(fs)}.")
    if len(task) != 6 or n != 288:
        raise ValueError(f"Expected 6 motor-imagery runs with 288 trials, found {len(task)} runs and {n} trials.")
    if not set(np.unique(ys).astype(int)) <= {1, 2, 3, 4}:
        raise ValueError("Class codes outside 1–4 found.")
    art = int(sum(np.atleast_1d(r.artifacts).sum() for r in task))
    return {"file": f"{s}{sess}.mat", "bytes": path.stat().st_size, "sha256": digest[:16], "official_checksum": official or "no match (structure checks only)",
            "runs": len(runs), "task_runs": len(task), "trials": n, "artifact_trials": art, "channels": 25, "fs": data.FS_EXPECTED}


def job(d, s):
    d = Path(d)
    st = {"participant": s, "stages": [], "state": "running", "started_at": now(), "precomputed_target_artifacts_used": False}
    t_job = time.perf_counter()

    def stage(key, label, fn):
        st["stages"].append({"key": key, "label": label, "state": "running", "started_at": now()})
        (d / "status.json").write_text(json.dumps(st))
        t0 = time.perf_counter()
        out = fn()
        st["stages"][-1].update(state="done", seconds=round(time.perf_counter() - t0, 3), detail=out)
        (d / "status.json").write_text(json.dumps(st))
        return out

    try:
        cal, ev = d / "calibration.mat", d / "evaluation.mat"
        for p in (cal, ev):
            if not p.exists():
                raise ValueError(f"{p.name} was not uploaded.")
        models_path = source_model_file(s)
        if not models_path.exists():
            raise ValueError(f"Source models that exclude {s} have not been prepared yet, so {s} cannot be processed. Only A01 is prepared in this demo; choose A01 or ask the research team to prepare {s}.")
        stage("validate", "Validate recordings", lambda: {"calibration": validate_mat(cal, s, "T"), "evaluation": validate_mat(ev, s, "E")})

        def pre():
            Xc, _ycal_unused, ids_c = pipeline.epochs(s, "T", return_ids=True, path=cal)  # calibration labels discarded, never stored
            Xe, ye, ids_e = pipeline.epochs(s, "E", return_ids=True, path=ev)
            np.savez(d / "covs_calibration.npz", C=pipeline.covs(Xc), trial_ids=np.array(ids_c))
            np.savez(d / "covs_evaluation.npz", C=pipeline.covs(Xe), trial_ids=np.array(ids_e))
            np.savez(d / "labels_evaluation.npz", y=ye)  # sealed: opened only after prediction
            return {"calibration_trials": len(ids_c), "evaluation_trials": len(ids_e), "filter": pipeline.SETTINGS["filter"],
                    "band_hz": pipeline.SETTINGS["bandpass_hz"], "expert_artifact_trials_excluded": True, "calibration_labels_stored": False}
        stage("preprocess", "Preprocess and compute covariances", pre)

        def calib():
            C = np.load(d / "covs_calibration.npz")["C"]
            M = mean_riemann(C)
            np.savez(d / "calref.npz", M=M, n_trials=len(C), computed_at=now(), input_sha=sha(C))
            return {"n_trials": int(len(C)), "reference_sha": sha(M), "labels_read": False}
        cal_out = stage("calibrate", "Compute personal calibration", calib)

        def predict():
            models = pickle.loads(models_path.read_bytes())
            assert models["meta"]["excluded_participant"] == s and s not in models["meta"]["sources"]
            M = np.load(d / "calref.npz")["M"]
            C = np.load(d / "covs_evaluation.npz")["C"]
            W = invsqrtm(M)
            pa, pb = models["A"].predict(C), models["B"].predict(W @ C @ W.T)
            np.savez(d / "predictions.npz", a=pa, b=pb)
            st["_models_meta"] = models["meta"]
            return {"predicted_trials": int(len(pa)), "source_models": f"{models_path.name}: trained {models['meta']['trained_at'][:19]} UTC on {', '.join(models['meta']['sources'])} ({s} excluded)",
                    "reference_unchanged": sha(np.load(d / 'calref.npz')['M']) == cal_out["reference_sha"]}
        pred_out = stage("predict", "Predict evaluation trials (A and B)", predict)

        def comp():
            p = np.load(d / "predictions.npz")
            y = np.load(d / "labels_evaluation.npz")["y"]  # opened only now, for scoring
            sc = scored(p["a"], p["b"], y)
            ids = [str(i) for i in np.load(d / "covs_evaluation.npz")["trial_ids"]]
            meta = st.pop("_models_meta")
            ref = np.load(d / "calref.npz")
            st["result"] = {
                "participant": s, "mode": "computed_now", "computed_at": now(), "source": "uploaded recordings",
                "seconds": {"train_sources": 0, "predict": st["stages"][-2]["seconds"], "total": round(time.perf_counter() - t_job, 2)},
                "sources": meta["sources"], "source_training_trials": meta["source_training_trials"], "source_models": pred_out["source_models"],
                "calibration": {"computed_at": str(ref["computed_at"]), "n_trials": int(ref["n_trials"]), "reference_sha": cal_out["reference_sha"]},
                "reference_unchanged_after_inference": pred_out["reference_unchanged"] and sha(ref["M"]) == cal_out["reference_sha"],
                "labels_used_for": "scoring only (loaded after both pipelines predicted)",
                **sc, "benchmark_check": benchmark_check(s, sc["A_no_alignment"], sc["B_recentered"], len(y)),
                "trials": [{"id": i, "true": int(t), "a": int(a), "b": int(b)} for i, t, a, b in zip(ids, y, p["a"], p["b"])],
            }
            return {"benchmark_match": st["result"]["benchmark_check"]["pass"], "delta_pp": round(sc["delta_accuracy_pp"], 2)}
        stage("compare", "Score and compare", comp)
        st.update(state="done", finished_at=now(), total_seconds=round(time.perf_counter() - t_job, 2))
    except Exception as e:
        if st["stages"] and st["stages"][-1]["state"] == "running":
            st["stages"][-1]["state"] = "failed"
        st.update(state="failed", error=str(e) if isinstance(e, (ValueError, AssertionError)) else f"{type(e).__name__}: {e}",
                  traceback=traceback.format_exc()[-800:] if not isinstance(e, ValueError) else None, finished_at=now())
        st.pop("_models_meta", None)
    (d / "status.json").write_text(json.dumps(st))
    return {"state": st["state"], "total_seconds": st.get("total_seconds"), "error": st.get("error")} if st["state"] == "done" else {"state": "failed", "message": st["error"]}


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "job":
        print(json.dumps(job(args[0], args[1]) if len(args) == 2 and args[1] in data.SUBJECTS else {"error": "bad_args"}))
        sys.exit(0)
    if cmd != "prepare" and (not args or args[0] not in data.SUBJECTS):
        print(json.dumps({"error": "bad_participant"}))
        sys.exit(0)
    out = {"prepare": lambda: prepare(), "status": lambda: status(args[0]), "sources": lambda: sources(args[0]),
           "calibrate": lambda: calibrate(args[0], "--recompute" in args), "compare": lambda: compare(args[0])}[cmd]()
    print(json.dumps(out))
