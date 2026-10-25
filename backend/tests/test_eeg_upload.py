# EEG upload onboarding: /api/research/uploads* (auth, validation errors, A01 happy path, swapped files, missing source models)
import os
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
CHUNK = 4 * 1024 * 1024
_TOK = {}


def H():
    # token_for caches for 45 s itself; a second cache here produced expired tokens (iteration 14)
    return {"Authorization": f"Bearer {token_for(CLINICIAN_ID)}"}


def new_job(pid="A01"):
    r = requests.post(API, json={"participant": pid}, headers=H(), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def upload(job, role, path):
    data = open(path, "rb").read()
    total = (len(data) + CHUNK - 1) // CHUNK
    for i in range(total):
        r = requests.put(f"{API}/{job}/files/{role}", params={"index": i, "total": total, "filename": os.path.basename(path)},
                         data=data[i * CHUNK:(i + 1) * CHUNK], headers={**H(), "Content-Type": "application/octet-stream"}, timeout=120)
        assert r.status_code == 200, r.text
    return r.json()


def process_and_wait(job, timeout=120):
    r = requests.post(f"{API}/{job}/process", headers=H(), timeout=30)
    assert r.status_code == 202, r.text
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = requests.get(f"{API}/{job}", headers=H(), timeout=30).json()
        if s["state"] in ("done", "failed"):
            return s
        time.sleep(0.5)
    pytest.fail("job did not finish")


class TestAuthAndValidation:
    def test_create_no_auth_401(self):
        assert requests.post(API, json={"participant": "A01"}, timeout=30).status_code == 401

    def test_status_no_auth_401(self):
        assert requests.get(f"{API}/{'0' * 32}", timeout=30).status_code == 401

    def test_unknown_participant_404(self):
        assert requests.post(API, json={"participant": "A10"}, headers=H(), timeout=30).status_code == 404

    def test_create_job_shape(self):
        j = new_job()
        assert len(j["id"]) == 32 and j["participant"] == "A01" and j["files"] == {}
        s = requests.get(f"{API}/{j['id']}", headers=H(), timeout=30).json()
        assert s["state"] == "awaiting_upload" and s["stages"] == []

    def test_non_mat_filename_400(self):
        j = new_job()
        r = requests.put(f"{API}/{j['id']}/files/calibration", params={"index": 0, "total": 1, "filename": "x.csv"},
                         data=b"abc", headers={**H(), "Content-Type": "application/octet-stream"}, timeout=30)
        assert r.status_code == 400 and ".mat" in r.text

    def test_bad_role_400(self):
        j = new_job()
        r = requests.put(f"{API}/{j['id']}/files/foo", params={"index": 0, "total": 1, "filename": "x.mat"},
                         data=b"abc", headers={**H(), "Content-Type": "application/octet-stream"}, timeout=30)
        assert r.status_code == 400

    def test_out_of_order_chunk_409(self):
        j = new_job()
        r = requests.put(f"{API}/{j['id']}/files/calibration", params={"index": 1, "total": 2, "filename": "x.mat"},
                         data=b"abc", headers={**H(), "Content-Type": "application/octet-stream"}, timeout=30)
        assert r.status_code == 409

    def test_unknown_job_404(self):
        assert requests.get(f"{API}/{'a' * 32}", headers=H(), timeout=30).status_code == 404
        assert requests.get(f"{API}/..%2Fetc", headers=H(), timeout=30).status_code == 404

    def test_process_without_files_400(self):
        j = new_job()
        r = requests.post(f"{API}/{j['id']}/process", headers=H(), timeout=30)
        assert r.status_code == 400
        d = r.json()["detail"]
        assert d["error"] == "missing_files" and set(d["missing"]) == {"calibration", "evaluation"}


class TestJobs:
    def test_a01_happy_path(self):
        j = new_job()
        upload(j["id"], "calibration", f"{RAW}/A01T.mat")
        meta = upload(j["id"], "evaluation", f"{RAW}/A01E.mat")
        assert set(meta["files"]) == {"calibration", "evaluation"}
        s = process_and_wait(j["id"])
        assert s["state"] == "done", s.get("error")
        assert [x["key"] for x in s["stages"]] == ["validate", "preprocess", "calibrate", "predict", "compare"]
        assert all(x["state"] == "done" and isinstance(x["seconds"], (int, float)) for x in s["stages"])
        assert s["precomputed_target_artifacts_used"] is False
        v = s["stages"][0]["detail"]
        assert v["calibration"]["official_checksum"] == "A01T.mat" and v["evaluation"]["official_checksum"] == "A01E.mat"
        for k in ("calibration", "evaluation"):
            assert v[k]["channels"] == 25 and v[k]["fs"] == 250 and v[k]["task_runs"] == 6 and v[k]["trials"] == 288
        r = s["result"]
        assert r["benchmark_check"]["pass"] is True
        assert round(r["A_no_alignment"]["accuracy"] * 100, 1) == 52.7
        assert round(r["B_recentered"]["accuracy"] * 100, 1) == 61.2
        assert round(r["delta_accuracy_pp"], 1) == 8.5
        assert "A01" not in r["sources"] and "(A01 excluded)" in r["source_models"]
        assert r["labels_used_for"].startswith("scoring only")
        # processed job cannot receive more chunks
        rr = requests.put(f"{API}/{j['id']}/files/calibration", params={"index": 0, "total": 1, "filename": "x.mat"},
                          data=b"abc", headers={**H(), "Content-Type": "application/octet-stream"}, timeout=30)
        assert rr.status_code == 409

    def test_swapped_files(self):
        j = new_job()
        upload(j["id"], "calibration", f"{RAW}/A01E.mat")
        upload(j["id"], "evaluation", f"{RAW}/A01T.mat")
        s = process_and_wait(j["id"])
        assert s["state"] == "failed"
        assert s["stages"][0]["key"] == "validate" and s["stages"][0]["state"] == "failed"
        assert "official A01E.mat" in s["error"] and "uploaded as A01T.mat" in s["error"]

    def test_not_eeg_mat(self):
        j = new_job()
        upload(j["id"], "calibration", "/app/data/upload_test/not_eeg.mat")
        upload(j["id"], "evaluation", f"{RAW}/A01E.mat")
        s = process_and_wait(j["id"])
        assert s["state"] == "failed" and "Not a readable MATLAB file" in s["error"]
        assert len(s["stages"]) == 1 and s["stages"][0]["state"] == "failed"

    def test_a02_no_source_models(self):
        j = new_job("A02")
        upload(j["id"], "calibration", "/app/data/upload_test/not_eeg.mat")
        upload(j["id"], "evaluation", "/app/data/upload_test/not_eeg.mat")
        s = process_and_wait(j["id"])
        assert s["state"] == "failed" and "Source models that exclude A02 have not been prepared" in s["error"]


# Iteration 14: chunk ordering, chunk-size cap, raw .mat retention after the job finishes
class TestIter14Fixes:
    def _put(self, job, idx, total, data, role="calibration"):
        return requests.put(f"{API}/{job}/files/{role}", params={"index": idx, "total": total, "filename": "x.mat"},
                            data=data, headers={**H(), "Content-Type": "application/octet-stream"}, timeout=60)

    def test_chunk_skip_index_409(self):
        j = new_job()
        assert self._put(j["id"], 0, 3, b"a" * 10).status_code == 200
        r = self._put(j["id"], 2, 3, b"b" * 10)
        assert r.status_code == 409 and "out of order" in r.text
        # correct next index still accepted, repeat of an old index rejected
        assert self._put(j["id"], 1, 3, b"c" * 10).status_code == 200
        assert self._put(j["id"], 1, 3, b"c" * 10).status_code == 409
        assert self._put(j["id"], 2, 3, b"d" * 10).json()["complete"] is True

    def test_chunk_over_8mb_413(self):
        j = new_job()
        # backend answers 413 before reading the body; the ingress sometimes turns that early reply into 500/502, so retry
        for _ in range(3):
            r = self._put(j["id"], 0, 1, b"x" * (8 * 1024 * 1024 + 10))
            if r.status_code < 500:
                break
        assert r.status_code == 413, r.status_code
        assert "8 MB" in r.text, r.text[:300]

    def _assert_retention(self, job_id, s):
        d = f"{RAW}/uploads/{job_id}"
        # status.json reports done/failed slightly before _run_job's finally deletes the .mat files
        for _ in range(20):
            files = os.listdir(d)
            if not any(f.endswith(".mat") for f in files):
                break
            time.sleep(0.1)
        assert "calibration.mat" not in files and "evaluation.mat" not in files, files
        assert "status.json" in files, files
        g = requests.get(f"{API}/{job_id}", headers=H(), timeout=30).json()
        assert g["state"] == s["state"] and len(g["stages"]) == len(s["stages"])
        return files

    def test_retention_after_done(self):
        j = new_job()
        upload(j["id"], "calibration", f"{RAW}/A01T.mat")
        upload(j["id"], "evaluation", f"{RAW}/A01E.mat")
        s = process_and_wait(j["id"])
        assert s["state"] == "done"
        files = self._assert_retention(j["id"], s)
        print("remaining files after done:", files)
        g = requests.get(f"{API}/{j['id']}", headers=H(), timeout=30).json()
        assert round(g["result"]["delta_accuracy_pp"], 1) == 8.5 and g["result"]["benchmark_check"]["pass"] is True

    def test_retention_after_failed(self):
        j = new_job()
        upload(j["id"], "calibration", "/app/data/upload_test/not_eeg.mat")
        upload(j["id"], "evaluation", f"{RAW}/A01E.mat")
        s = process_and_wait(j["id"])
        assert s["state"] == "failed"
        files = self._assert_retention(j["id"], s)
        print("remaining files after failed:", files)
        assert "Not a readable MATLAB file" in requests.get(f"{API}/{j['id']}", headers=H(), timeout=30).json()["error"]
