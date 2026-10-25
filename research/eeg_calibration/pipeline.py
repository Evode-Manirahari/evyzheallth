"""Identical preprocessing for both pipelines; A = MDM without alignment, B = MDM with participant-specific
Riemannian recentering (unsupervised: reference = Riemannian mean of the participant's covariances, no labels)."""
import mne
import numpy as np
from pyriemann.classification import MDM
from pyriemann.estimation import Covariances
from pyriemann.utils.base import invsqrtm
from pyriemann.utils.mean import mean_riemann
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

from data import N_EEG, load_session

# Fixed a priori (literature-standard MI settings); never tuned on any target participant's data.
SETTINGS = {
    "eeg_channels": N_EEG, "eog_used": False,
    "bandpass_hz": [8.0, 30.0], "filter": "MNE IIR Butterworth order 4, zero-phase (filtfilt), per run on continuous signal",
    "epoch_window_s_after_cue": [0.5, 2.5], "cue_offset_s_from_trial_start": 2.0,
    "covariance_estimator": "oas", "classifier": "pyriemann MDM(metric='riemann')",
    "exclude_expert_artifact_trials": True, "nan_handling": "NaN samples (run separators) replaced by 0 before filtering",
    "source_sessions_used_for_training": ["T"], "target_calibration_session": "T", "target_test_session": "E",
    "target_calibration_labels_used": False, "seed": 0,
}


def epochs(subject: str, session: str, return_ids: bool = False):
    s = load_session(subject, session)
    X, y, ids = [], [], []
    lo, hi = SETTINGS["bandpass_hz"]
    for r in s["runs"]:
        if not r["trial"].size:
            continue
        fs = r["fs"]
        sig = np.nan_to_num(r["X"][:, :N_EEG].T)
        sig = mne.filter.filter_data(sig, fs, lo, hi, method="iir", iir_params={"order": 4, "ftype": "butter"}, verbose=False)
        a = int((SETTINGS["cue_offset_s_from_trial_start"] + SETTINGS["epoch_window_s_after_cue"][0]) * fs)
        b = int((SETTINGS["cue_offset_s_from_trial_start"] + SETTINGS["epoch_window_s_after_cue"][1]) * fs)
        for k, (t, lab, art) in enumerate(zip(r["trial"], r["y"], r["artifacts"]), start=1):
            if SETTINGS["exclude_expert_artifact_trials"] and art:
                continue
            start = t - 1  # MATLAB 1-based sample index
            X.append(sig[:, start + a:start + b])
            y.append(lab)
            ids.append(f"{subject}{session}-run{r['run']}-trial{k:02d}")
    if return_ids:
        return np.array(X), np.array(y), ids
    return np.array(X), np.array(y)


def covs(X):
    return Covariances(estimator=SETTINGS["covariance_estimator"]).transform(X)


def recenter(C, ref_from):
    """Whiten C by the Riemannian mean of ref_from (unlabeled). Returns aligned C."""
    W = invsqrtm(mean_riemann(ref_from))
    return W @ C @ W.T


def metrics(y_true, y_pred):
    return {"accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
            "macro_f1": round(float(f1_score(y_true, y_pred, average="macro")), 4),
            "confusion_matrix": confusion_matrix(y_true, y_pred, labels=[1, 2, 3, 4]).tolist(), "n_test": int(len(y_true))}


def run_fold(target: str, cache: dict, subjects: list):
    sources = [s for s in subjects if s != target]
    Cs = {s: cache[s]["T"][0] for s in sources}
    ys = {s: cache[s]["T"][1] for s in sources}
    C_cal, _unused_cal_labels = cache[target]["T"]
    C_test, y_test = cache[target]["E"]

    clf_a = MDM(metric="riemann").fit(np.concatenate([Cs[s] for s in sources]), np.concatenate([ys[s] for s in sources]))
    res_a = metrics(y_test, clf_a.predict(C_test))

    aligned = np.concatenate([recenter(Cs[s], Cs[s]) for s in sources])
    clf_b = MDM(metric="riemann").fit(aligned, np.concatenate([ys[s] for s in sources]))
    res_b = metrics(y_test, clf_b.predict(recenter(C_test, C_cal)))  # reference from calibration session only

    return {"target": target, "sources": sources,
            "source_training_trials": int(sum(len(ys[s]) for s in sources)),
            "calibration_trials_unlabeled": int(len(C_cal)), "test_trials": int(len(y_test)),
            "A_no_alignment": res_a, "B_recentered": res_b,
            "delta_accuracy_B_minus_A": round(res_b["accuracy"] - res_a["accuracy"], 4),
            "delta_macro_f1_B_minus_A": round(res_b["macro_f1"] - res_a["macro_f1"], 4)}
