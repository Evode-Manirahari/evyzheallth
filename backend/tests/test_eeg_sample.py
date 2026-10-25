# EEG sample-recordings button: POST /api/research/uploads/sample (auth, fresh isolated job, pipeline, cleanup, originals read-only)
import concurrent.futures
import hashlib
import os
import stat
import sys
import time

import pytest
import requests
from dotenv import dotenv_values

sys.path.insert(0, os.path.dirname(__file__))
from clerk_helper import token_for, CLINICIAN_ID  # noqa: E402

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api/research/uploads"
RAW = "/app/data/bci_iv_2a"
LABEL = "Sample raw recordings stored on server. Processed now. Source models prepared beforehand, excluding A01."
SHA = {"A01T.mat": "054f02e70cf9c4ada1517e9b9864f45407939c1062c6793516585c6f511d0325",
       "A01E.mat": "53d415f39c3d7b0c88b894d7b08d99bcdfe855ede63831d3691af1a45607fb62"}


def H():
    return {"Authorization": f"Bearer {token_for(CLINICIAN_ID)}"}


def start_sample():
    for _ in range(40):
        r = requests.post(f"{API}/sample", headers=H(), timeout=120)
        if r.status_code != 429:
            return r
        time.sleep(1)
    return r


def wait(job_id, timeout=120):
    t0 = time.time()
    seen = set()
    while time.time() - t0 < timeout:
        s = requests.get(f"{API}/{job_id}", headers=H(), timeout=30).json()
        seen.add(s["state"])
        if s["state"] in ("done", "failed"):
            return s, seen
        time.sleep(0.3)
    pytest.fail("job did not finish")


def no_mat_left(job_id):
    d = f"{RAW}/uploads/{job_id}"
    for _ in range(30):
        files = os.listdir(d)
        if not any(f.endswith(".mat") for f in files):
            return files
        time.sleep(0.1)
    return files


class TestSample:
    def test_no_auth_401(self):
        assert requests.post(f"{API}/sample", timeout=30).status_code == 401

    def test_sample_run_twice_isolated(self):
        ids = []
        for _ in range(2):
            t0 = time.time()
            r = start_sample()
            assert r.status_code == 202, r.text
            jid = r.json()["id"]
            s, seen = wait(jid)
            print(f"job {jid} wall {time.time() - t0:.1f}s server {s.get('total_seconds')}s states {seen}")
            assert s["state"] == "done", s.get("error")
            assert s["input"] == "server_sample" and s["label"] == LABEL and s["participant"] == "A01"
            assert s["precomputed_target_artifacts_used"] is False
            assert [x["key"] for x in s["stages"]] == ["validate", "preprocess", "calibrate", "predict", "compare"]
            assert all(x["state"] == "done" for x in s["stages"])
            v = s["stages"][0]["detail"]
            assert v["calibration"]["official_checksum"] == "A01T.mat" and v["evaluation"]["official_checksum"] == "A01E.mat"
            for k in ("calibration", "evaluation"):
                assert v[k]["channels"] == 25 and v[k]["fs"] == 250 and v[k]["trials"] == 288
            res = s["result"]
            assert res["benchmark_check"]["pass"] is True
            assert round(res["A_no_alignment"]["accuracy"] * 100, 1) == 52.7
            assert round(res["B_recentered"]["accuracy"] * 100, 1) == 61.2
            assert round(res["delta_accuracy_pp"], 1) == 8.5
            assert "A01" not in res["sources"] and "source_models_excl_A01.pkl" in res["source_models"]
            files = no_mat_left(jid)
            print("job files:", files)
            assert not any(f.endswith(".mat") for f in files), files
            # job owns its own reference
            assert "calref.npz" in files
            ids.append(jid)
        assert ids[0] != ids[1]
        # second job cannot be re-processed
        r = requests.post(f"{API}/{ids[1]}/process", headers=H(), timeout=30)
        assert r.status_code == 409

    def test_originals_read_only_and_unchanged(self):
        for name, h in SHA.items():
            p = f"{RAW}/{name}"
            assert os.path.exists(p)
            assert stat.filemode(os.stat(p).st_mode) == "-r--r--r--"
            assert hashlib.sha256(open(p, "rb").read()).hexdigest() == h
        assert os.path.exists(f"{RAW}/artifacts/source_models_excl_A01.pkl")

    def test_concurrent_sample_clicks_no_orphan_copies(self):
        # two simultaneous clicks: one should run, the other 202 or 429; no job folder may keep .mat copies
        before = set(os.listdir(f"{RAW}/uploads"))
        with concurrent.futures.ThreadPoolExecutor(2) as ex:
            rs = list(ex.map(lambda _: requests.post(f"{API}/sample", headers=H(), timeout=120), range(2)))
        codes = [r.status_code for r in rs]
        print("concurrent codes:", codes, [r.text[:150] for r in rs])
        for r in rs:
            if r.status_code == 202:
                wait(r.json()["id"])
        time.sleep(1)
        new = set(os.listdir(f"{RAW}/uploads")) - before
        leftovers = {j: os.listdir(f"{RAW}/uploads/{j}") for j in new}
        print("new job dirs:", leftovers)
        orphan = {j: f for j, f in leftovers.items() if any(x.endswith(".mat") for x in f)}
        assert not orphan, f"orphan .mat copies left: {orphan}"
        assert all(c in (202, 429) for c in codes)


class TestSampleConcurrency3:
    # iteration 16: 3 simultaneous POSTs -> exactly one 202, others 429; exactly one new folder, no orphans, no .mat left
    @pytest.mark.parametrize("rep", [1, 2])
    def test_three_simultaneous_exactly_one_job(self, rep):
        import shutil
        # wait until idle
        before = set(os.listdir(f"{RAW}/uploads"))
        tok = token_for(CLINICIAN_ID)
        hdr = {"Authorization": f"Bearer {tok}"}
        with concurrent.futures.ThreadPoolExecutor(3) as ex:
            rs = list(ex.map(lambda _: requests.post(f"{API}/sample", headers=hdr, timeout=120), range(3)))
        codes = [r.status_code for r in rs]
        print(f"rep{rep} codes:", codes)
        assert sorted(codes) == [202, 429, 429], codes
        for r in rs:
            if r.status_code == 429:
                assert r.json()["detail"]["error"] == "busy"
        job = next(r.json()["id"] for r in rs if r.status_code == 202)
        s, _ = wait(job)
        assert s["state"] == "done", s.get("error")
        assert s["result"]["benchmark_check"]["pass"] is True
        time.sleep(1)
        new = set(os.listdir(f"{RAW}/uploads")) - before
        print("new dirs:", {j: os.listdir(f"{RAW}/uploads/{j}") for j in new})
        assert new == {job}, new
        assert not any(f.endswith(".mat") for f in no_mat_left(job))
        shutil.rmtree(f"{RAW}/uploads/{job}")
