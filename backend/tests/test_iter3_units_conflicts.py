# Iteration 3: unit provenance on context API, conflict counts, reimport idempotency for 001, DB regression vs snapshot.
import json
import os

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

from clerk_helper import token_for, CLINICIAN_ID

BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].rstrip("/")
_env = dotenv_values("/app/backend/.env")
db = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
SNAP = json.load(open(os.path.join(os.path.dirname(__file__), ".snapshot_before.json")))


@pytest.fixture(scope="module")
def h():
    return {"Authorization": f"Bearer {token_for(CLINICIAN_ID)}"}


# Unit provenance - heart rate
def test_hr_unit_unverified(h):
    r = requests.get(f"{BASE_URL}/api/patients/001/context/heart_rate", headers=h, timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d["unit"] == "bpm" and d["unit_status"] == "unverified" and d["unit_in_file"] is None
    assert len(d["documentation"]) == 2
    urls = {x["url"] for x in d["documentation"]}
    assert any("empatica.com" in u for u in urls) and "https://doi.org/10.13026/aw6y-fc44" in urls
    assert d["conflicts_count"] == 0 and d["conflicts"] == []
    assert len(d["points"]) == 10578


# Unit provenance - skin temperature
def test_temp_unit_documented(h):
    d = requests.get(f"{BASE_URL}/api/patients/001/context/skin_temperature", headers=h, timeout=60).json()
    assert d["unit"] == "°C" and d["unit_status"] == "documented" and d["unit_in_file"] is None
    assert len(d["documentation"]) == 2 and "Celsius" in d["documentation"][0]["states"]
    assert d["conflicts_count"] == 0
    assert len(d["points"]) == 10580


def test_context_requires_auth():
    assert requests.get(f"{BASE_URL}/api/patients/001/context/heart_rate", timeout=30).status_code == 401


# Reimport idempotency (real data, 0 new expected)
@pytest.mark.parametrize("fn,n", [("HR_001.csv", 10578), ("TEMP_001.csv", 10580)])
def test_reimport_001(h, fn, n):
    before = db.measurement_aggregates.count_documents({"patient_id": "001"})
    r = requests.post(f"{BASE_URL}/api/server-files/import", headers=h, json={"filename": fn, "participant_id": "001"}, timeout=280)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["inserted"] == 0 and d["identical_skipped"] == n and d["conflicts_flagged"] == 0
    assert db.measurement_aggregates.count_documents({"patient_id": "001"}) == before
    assert db.aggregate_conflicts.count_documents({"patient_id": "001"}) == 0


def test_no_duplicate_minutes_001():
    dup = list(db.measurement_aggregates.aggregate([
        {"$match": {"patient_id": "001"}},
        {"$group": {"_id": {"m": "$metric", "s": "$source", "t": "$ts"}, "n": {"$sum": 1}}},
        {"$match": {"n": {"$gt": 1}}}]))
    assert dup == []


# Regression vs snapshot: events, summaries, reviews, glucose count
def _strip(rows, keys):
    return sorted([{k: r.get(k) for k in keys} for r in rows], key=lambda x: json.dumps(x, sort_keys=True, default=str))


def test_events_unchanged():
    keys = sorted(SNAP["events"][0].keys())
    cur = list(db.events.find({"id": {"$in": [e["id"] for e in SNAP["events"]]}}, {"_id": 0}))
    assert _strip(cur, keys) == _strip(SNAP["events"], keys)
    assert db.events.count_documents({"patient_id": "001"}) == len(SNAP["events"])


def test_summaries_unchanged():
    keys = sorted(SNAP["summaries"][0].keys())
    cur = list(db.summaries.find({"event_id": {"$in": [s["event_id"] for s in SNAP["summaries"]]}}, {"_id": 0}))
    assert _strip(cur, keys) == _strip(SNAP["summaries"], keys)


def test_reviews_unchanged():
    keys = sorted(SNAP["reviews"][0].keys())
    cur = list(db.reviews.find({"event_id": {"$in": [r["event_id"] for r in SNAP["reviews"]]}}, {"_id": 0}))
    assert _strip(cur, keys) == _strip(SNAP["reviews"], keys)


def test_glucose_count():
    assert db.measurements.count_documents({"patient_id": "001"}) == SNAP["glucose_count"] == 2561
