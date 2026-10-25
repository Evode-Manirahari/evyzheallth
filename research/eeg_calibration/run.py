"""Usage: python run.py inspect | python run.py fold A01 | python run.py all
Writes JSON reports to results/. Leave-one-participant-out; target E session is used only for final testing."""
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import mne
import numpy as np
import pyriemann
import scipy
import sklearn

import data
import pipeline

OUT = Path(__file__).parent / "results"
OUT.mkdir(exist_ok=True)


def versions():
    return {"python": platform.python_version(), "mne": mne.__version__, "pyriemann": pyriemann.__version__,
            "scikit-learn": sklearn.__version__, "numpy": np.__version__, "scipy": scipy.__version__}


def build_cache(subjects):
    cache = {}
    for s in subjects:
        cache[s] = {}
        for sess in ("T", "E"):
            X, y = pipeline.epochs(s, sess)
            cache[s][sess] = (pipeline.covs(X), y)
    return cache


def save(name, obj):
    obj = {"generated_at": datetime.now(timezone.utc).isoformat(), "namespace": data.NAMESPACE, "versions": versions(),
           "settings": pipeline.SETTINGS, **obj}
    (OUT / name).write_text(json.dumps(obj, indent=1))
    print(f"wrote results/{name}")


def main(cmd, arg=None):
    np.random.seed(pipeline.SETTINGS["seed"])
    if cmd == "inspect":
        save("inspection.json", {"files": [data.inspect(s, sess) for s in data.SUBJECTS for sess in ("T", "E")]})
        return
    cache = build_cache(data.SUBJECTS)
    targets = [arg] if cmd == "fold" else data.SUBJECTS
    folds = [pipeline.run_fold(t, cache, data.SUBJECTS) for t in targets]
    for f in folds:
        print(f"{f['target']}: A acc={f['A_no_alignment']['accuracy']:.4f} F1={f['A_no_alignment']['macro_f1']:.4f} | "
              f"B acc={f['B_recentered']['accuracy']:.4f} F1={f['B_recentered']['macro_f1']:.4f} | dAcc={f['delta_accuracy_B_minus_A']:+.4f}")
    summary = {}
    if len(folds) > 1:
        for k in ("A_no_alignment", "B_recentered"):
            summary[k] = {m: round(float(np.mean([f[k][m] for f in folds])), 4) for m in ("accuracy", "macro_f1")}
        summary["regressions"] = [f["target"] for f in folds if f["delta_accuracy_B_minus_A"] < 0]
        summary["improved"] = [f["target"] for f in folds if f["delta_accuracy_B_minus_A"] > 0]
        print("mean", summary)
    save(f"loso_{'all' if cmd == 'all' else arg}.json", {"folds": folds, "summary": summary,
         "epoch_counts": {s: {sess: int(len(cache[s][sess][1])) for sess in ("T", "E")} for s in data.SUBJECTS}})


if __name__ == "__main__":
    main(*sys.argv[1:])
