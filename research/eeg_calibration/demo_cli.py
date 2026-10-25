"""Interactive demo backend (invoked by the EVYZ API as a subprocess). Reuses pipeline.py unchanged in protocol.

Commands (JSON to stdout):
  prepare               build per-session covariance artifacts (labels stored in separate files)
  status <S>            what exists for participant S
  calibrate <S> [--recompute]   reference = Riemannian mean of S's training-session covariances (no labels read)
  compare <S>           train A/B on the 8 source training sessions, predict S's evaluation trials, then score
"""
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from pyriemann.classification import MDM
from pyriemann.utils.base import invsqrtm
from pyriemann.utils.mean import mean_riemann

import data
import pipeline

ART = data.RAW_DIR / "artifacts"
BENCH = Path(__file__).parent / "results" / "loso_all.json"
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


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd != "prepare" and (not args or args[0] not in data.SUBJECTS):
        print(json.dumps({"error": "bad_participant"}))
        sys.exit(0)
    out = {"prepare": lambda: prepare(), "status": lambda: status(args[0]),
           "calibrate": lambda: calibrate(args[0], "--recompute" in args), "compare": lambda: compare(args[0])}[cmd]()
    print(json.dumps(out))
