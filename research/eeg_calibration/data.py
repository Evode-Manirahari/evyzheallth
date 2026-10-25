"""Loader for BCI Competition IV Dataset 2a (BNCI Horizon 2020 001-2014 .mat release).

Separate research namespace: participants are 'bci_iv_2a/A01'..'A09'. Never touches the clinic database.
Raw files live in RAW_DIR (outside Git)."""
import os
from pathlib import Path

import numpy as np
from scipy.io import loadmat

NAMESPACE = "bci_iv_2a"
RAW_DIR = Path(os.environ.get("EVYZ_BCI2A_DIR", "/app/data/bci_iv_2a"))
SUBJECTS = [f"A0{i}" for i in range(1, 10)]
SESSIONS = {"T": "training (session 1)", "E": "evaluation (session 2)"}
N_EEG = 22  # first 22 channels are EEG, last 3 are EOG (official doc: EOG must not be used for classification)
FS_EXPECTED = 250
CLASS_NAMES = ["left hand", "right hand", "both feet", "tongue"]


def load_session(subject: str, session: str, path=None) -> dict:
    """Return runs with continuous signal, trial onsets (samples, start of trial t=0), labels 1-4, artifact flags."""
    m = loadmat(Path(path) if path else RAW_DIR / f"{subject}{session}.mat", squeeze_me=True, struct_as_record=False)["data"]
    runs = []
    for i, r in enumerate(np.atleast_1d(m)):
        trial = np.atleast_1d(r.trial).astype(int)
        runs.append({
            "run": i, "X": np.asarray(r.X, dtype=float), "fs": int(r.fs),
            "trial": trial, "y": np.atleast_1d(r.y).astype(int) if trial.size else np.array([], int),
            "artifacts": np.atleast_1d(r.artifacts).astype(int) if trial.size else np.array([], int),
            "classes": [str(c) for c in np.atleast_1d(r.classes)],
        })
    return {"subject": subject, "session": session, "runs": runs}


def official_true_labels(subject: str, session: str):
    """Labels from the official BCI Competition IV true_labels.zip (bbci.de), if present."""
    p = RAW_DIR / "true_labels" / f"{subject}{session}.mat"
    return np.atleast_1d(loadmat(p, squeeze_me=True)["classlabel"]).astype(int) if p.exists() else None


def inspect(subject: str, session: str) -> dict:
    s = load_session(subject, session)
    task_runs = [r for r in s["runs"] if r["trial"].size]
    y = np.concatenate([r["y"] for r in task_runs]) if task_runs else np.array([], int)
    art = np.concatenate([r["artifacts"] for r in task_runs]) if task_runs else np.array([], int)
    official = official_true_labels(subject, session)
    return {
        "file": f"{subject}{session}.mat", "runs_total": len(s["runs"]), "task_runs": len(task_runs),
        "eog_only_runs": len(s["runs"]) - len(task_runs),
        "channels": int(s["runs"][0]["X"].shape[1]), "fs": sorted({r["fs"] for r in s["runs"]}),
        "trials": int(y.size), "class_counts": {int(c): int((y == c).sum()) for c in np.unique(y)},
        "artifact_trials": int(art.sum()), "classes": task_runs[0]["classes"] if task_runs else [],
        "nan_samples": int(sum(np.isnan(r["X"]).sum() for r in s["runs"])),
        "official_labels_match": None if official is None else bool(official.size == y.size and np.array_equal(official, y)),
    }
