# Online EEG personalization demo: /api/research/demo/{pid}/status|calibrate|compare (auth, 404, 409, compute, benchmark match)
import json
import os
import sys
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

sys.path.insert(0, os.path.dirname(__file__))
from clerk_helper import token_for, CLINICIAN_ID  # noqa: E402

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api/research/demo"
ART = Path("/app/data/bci_iv_2a/artifacts")
BENCH = json.loads(Path("/app/research/eeg_calibration/results/loso_all.json").read_text())


def H():
    return {"Authorization": f"Bearer {token_for(CLINICIAN_ID)}"}


# Auth / validation
class TestAuthValidation:
    def test_compare_no_auth_401(self):
        r = requests.post(f"{API}/A01/compare", timeout=30)
        assert r.status_code == 401

    def test_status_no_auth_401(self):
        assert requests.get(f"{API}/A01/status", timeout=30).status_code == 401

    def test_unknown_pid_404(self):
        r = requests.post(f"{API}/A10/calibrate", headers=H(), timeout=30)
        assert r.status_code == 404

    def test_compare_no_calibration_409(self):
        (ART / "calref_A05.npz").unlink(missing_ok=True)
        r = requests.post(f"{API}/A05/compare", headers=H(), timeout=60)
        assert r.status_code == 409, r.text
        d = r.json()["detail"]
        assert d["error"] == "no_calibration"
        assert "calref_A05.npz" in d["missing"]


# Status / calibrate
class TestCalibrate:
    def test_status_sessions(self):
        r = requests.get(f"{API}/A01/status", headers=H(), timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["missing"] == []
        assert d["calibration_session"]["trials"] == 273
        assert d["evaluation_session"]["trials"] == 281

    def test_calibrate_compute_load_recompute(self):
        (ART / "calref_A01.npz").unlink(missing_ok=True)
        r1 = requests.post(f"{API}/A01/calibrate", headers=H(), timeout=60).json()
        assert r1["mode"] == "computed_now" and r1["n_trials"] == 273 and r1["labels_read"] is False
        r2 = requests.post(f"{API}/A01/calibrate", headers=H(), timeout=60).json()
        assert r2["mode"] == "loaded" and r2["computed_at"] == r1["computed_at"]
        assert r2["reference_sha"] == r1["reference_sha"]
        r3 = requests.post(f"{API}/A01/calibrate?recompute=true", headers=H(), timeout=60).json()
        assert r3["mode"] == "computed_now" and r3["computed_at"] != r1["computed_at"]
        assert r3["reference_sha"] == r1["reference_sha"]  # deterministic


# Compare
def _bench(pid):
    return next(f for f in BENCH["folds"] if f["target"] == pid)


@pytest.mark.parametrize("pid,ca,cb,n,fixed,broken", [("A01", 148, 172, 281, 52, 28), ("A07", 124, 108, 277, 76, 92)])
def test_compare(pid, ca, cb, n, fixed, broken):
    requests.post(f"{API}/{pid}/calibrate", headers=H(), timeout=60)
    r = requests.post(f"{API}/{pid}/compare", headers=H(), timeout=180)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["A_no_alignment"]["correct"] == ca and d["B_recentered"]["correct"] == cb
    assert d["A_no_alignment"]["n_test"] == n and len(d["trials"]) == n
    assert d["trial_changes"]["fixed_by_B"] == fixed and d["trial_changes"]["broken_by_B"] == broken
    assert sum(d["trial_changes"].values()) == n
    assert abs(d["delta_accuracy_pp"] - (cb - ca) / n * 100) < 1e-9
    assert d["benchmark_check"]["pass"] is True
    assert d["reference_unchanged_after_inference"] is True
    b = _bench(pid)
    assert d["A_no_alignment"]["confusion_matrix"] == b["A_no_alignment"]["confusion_matrix"]
    assert d["B_recentered"]["confusion_matrix"] == b["B_recentered"]["confusion_matrix"]
    assert pid not in d["sources"] and len(d["sources"]) == 8
    print(pid, d["seconds"])


# Missing artifacts
def test_missing_artifact_A03():
    f, bak = ART / "covs_A03E.npz", ART / "covs_A03E.npz.testbak"
    f.rename(bak)
    try:
        r = requests.get(f"{API}/A03/status", headers=H(), timeout=60)
        assert r.status_code == 200
        assert "covs_A03E.npz" in r.json()["missing"]
        requests.post(f"{API}/A03/calibrate", headers=H(), timeout=60)
        r = requests.post(f"{API}/A03/compare", headers=H(), timeout=60)
        assert r.status_code == 409 and r.json()["detail"]["error"] == "missing_artifacts"
    finally:
        bak.rename(f)
    assert f.exists()
    assert requests.get(f"{API}/A03/status", headers=H(), timeout=60).json()["missing"] == []


# DEMO_LOCK: two concurrent compares -> one 200, one 429 busy
def test_concurrent_compare_busy():
    from concurrent.futures import ThreadPoolExecutor
    r = requests.post(f"{API}/A01/calibrate", headers=H(), timeout=120)
    assert r.status_code == 200
    h = H()
    with ThreadPoolExecutor(2) as ex:
        fs = [ex.submit(requests.post, f"{API}/A01/compare", headers=h, timeout=200) for _ in range(2)]
        rs = [f.result() for f in fs]
    codes = sorted(x.status_code for x in rs)
    assert codes == [200, 429], codes
    busy = [x for x in rs if x.status_code == 429][0].json()
    assert busy["detail"]["error"] == "busy"
    ok = [x for x in rs if x.status_code == 200][0].json()
    assert ok["A_no_alignment"]["correct"] == 148 and ok["B_recentered"]["correct"] == 172
    assert ok["benchmark_check"]["pass"] is True
