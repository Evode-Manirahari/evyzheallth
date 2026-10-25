# Personalization Lab: GET /api/research/eeg-calibration (auth, payload == results file, unavailable state, no DB writes)
import json
import os
import sys
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

sys.path.insert(0, os.path.dirname(__file__))
from clerk_helper import token_for, CLINICIAN_ID  # noqa: E402

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
URL = f"{BASE_URL}/api/research/eeg-calibration"
RES = Path("/app/research/eeg_calibration/results/loso_all.json")
BAK = RES.with_name("loso_all.json.bak")
_env = dotenv_values("/app/backend/.env")


def _hdr():
    return {"Authorization": f"Bearer {token_for(CLINICIAN_ID)}"}


def _db_state():
    db = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
    return {c: db[c].estimated_document_count() for c in sorted(db.list_collection_names())}


# Auth
def test_401_without_token():
    r = requests.get(URL, timeout=20)
    assert r.status_code in (401, 403)


def test_401_with_bad_token():
    r = requests.get(URL, headers={"Authorization": "Bearer garbage"}, timeout=20)
    assert r.status_code in (401, 403)


# Payload matches file
def test_payload_equals_file():
    r = requests.get(URL, headers=_hdr(), timeout=20)
    assert r.status_code == 200
    d = r.json()
    f = json.loads(RES.read_text())
    s = d["summary"]
    assert s["A_no_alignment"]["accuracy"] == 0.3582
    assert s["B_recentered"]["accuracy"] == 0.472
    assert s["A_no_alignment"]["macro_f1"] == 0.2739
    assert s["B_recentered"]["macro_f1"] == 0.4448
    assert s["regressions"] == ["A02", "A07"]
    assert len(d["folds"]) == 9
    assert [x["target"] for x in d["folds"]] == [f"A0{i}" for i in range(1, 10)]
    for k in f:
        assert d[k] == f[k], k
    assert d["source_file"] == "loso_all.json"


# No DB writes from lab endpoint
def test_no_db_side_effects():
    before = _db_state()
    for _ in range(3):
        assert requests.get(URL, headers=_hdr(), timeout=20).status_code == 200
    after = _db_state()
    assert set(before) == set(after)
    assert not any("eeg" in c.lower() or "research" in c.lower() for c in after)


# Unavailable state (file renamed then restored)
def test_unavailable_503_and_restore():
    assert RES.exists()
    RES.rename(BAK)
    try:
        r = requests.get(URL, headers=_hdr(), timeout=20)
        assert r.status_code == 503
        assert "unavailable" in r.json().get("detail", "").lower()
    finally:
        BAK.rename(RES)
    assert RES.exists() and not BAK.exists()
    assert requests.get(URL, headers=_hdr(), timeout=20).status_code == 200
