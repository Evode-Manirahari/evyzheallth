# EVYZ iteration 2: HR/TEMP contextual data for participant 001 (read-mostly; restores reviews). Safe to run on real data.
import os
import sys
import pytest
import requests
from dotenv import dotenv_values

sys.path.insert(0, os.path.dirname(__file__))
from clerk_helper import token_for, CLINICIAN_ID  # noqa: E402

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
PID = "001"


def api(method, path, auth=True, **kw):
    h = {"Authorization": f"Bearer {token_for(CLINICIAN_ID)}"} if auth else {}
    return requests.request(method, f"{BASE_URL}/api{path}", headers=h, timeout=600, **kw)


# --- auth on new endpoints
@pytest.mark.parametrize("path", ["/patients/001/context/heart_rate", "/patients/001/context/skin_temperature", "/server-files"])
def test_401_without_token(path):
    assert api("GET", path, auth=False).status_code == 401


def test_import_401_without_token():
    assert api("POST", "/server-files/import", auth=False, json={"filename": "HR_001.csv", "participant_id": PID}).status_code == 401


# --- context series
@pytest.mark.parametrize("metric,n,unit,label", [("heart_rate", 10578, "bpm", "Heart rate"), ("skin_temperature", 10580, "°C", "Skin temperature")])
def test_context_series(metric, n, unit, label):
    r = api("GET", f"/patients/{PID}/context/{metric}")
    assert r.status_code == 200
    d = r.json()
    assert d["unit"] == unit and d["label"] == label and d["interval"] == "1min"
    pts = d["points"]
    assert len(pts) == n
    assert all("_id" not in p for p in pts[:50])
    p = pts[0]
    assert set(p) >= {"ts", "mean", "min", "max", "count"}
    assert all(q["min"] <= q["mean"] <= q["max"] and q["count"] >= 1 for q in pts)
    assert [q["ts"] for q in pts] == sorted(q["ts"] for q in pts)
    assert len(set(q["ts"] for q in pts)) == n
    for g in d["gaps"]:
        assert g["minutes"] > 2


def test_hr_gap_count():
    d = api("GET", f"/patients/{PID}/context/heart_rate").json()
    print("HR gaps", len(d["gaps"]), d["gaps"][:3])
    assert len(d["gaps"]) == 7


def test_context_bad_metric_and_unknown_patient():
    assert api("GET", f"/patients/{PID}/context/glucose").status_code == 422
    assert api("GET", "/patients/NOPE_XYZ/context/heart_rate").status_code == 404


# --- server files list
def test_server_files_list():
    r = api("GET", "/server-files")
    assert r.status_code == 200
    names = {f["filename"]: f for f in r.json()}
    assert "HR_001.csv" in names and "TEMP_001.csv" in names
    assert "Dexcom_001.csv" not in names
    assert names["HR_001.csv"]["metric"] == "heart_rate" and names["HR_001.csv"]["suggested_participant_id"] == "001"
    assert names["TEMP_001.csv"]["metric"] == "skin_temperature"


# --- import validation
@pytest.mark.parametrize("fn", ["../backend/.env", "HR_999.csv", "Dexcom_001.csv", "/etc/passwd", "HR_001.csv/../TEMP_001.csv"])
def test_import_bad_filename_404(fn):
    r = api("POST", "/server-files/import", json={"filename": fn, "participant_id": PID})
    assert r.status_code == 404, r.text


def test_import_unknown_participant_400():
    r = api("POST", "/server-files/import", json={"filename": "HR_001.csv", "participant_id": "NOPE_XYZ"})
    assert r.status_code == 400
    r = api("POST", "/server-files/import", json={"filename": "HR_001.csv", "participant_id": "../x"})
    assert r.status_code == 422


# --- idempotent reimport
def test_hr_reimport_idempotent():
    r = api("POST", "/server-files/import", json={"filename": "HR_001.csv", "participant_id": PID})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["inserted"] == 0 and d["duplicates_skipped"] == 10578 and d["aggregates"] == 10578
    assert d["raw_rows"] == 634188 and d["invalid_rows"] == 0
    assert "_id" not in d
    assert len(api("GET", f"/patients/{PID}/context/heart_rate").json()["points"]) == 10578


# --- regression: glucose workflow on 001
def test_overview_001():
    pts = api("GET", "/patients").json()
    p = next(x for x in pts if x["id"] == PID)
    print({k: v for k, v in p.items() if not isinstance(v, (list, dict))})
    assert p.get("unreviewed_count", p.get("unreviewed")) == 2


def test_glucose_series_gap():
    s = api("GET", f"/patients/{PID}/series").json()
    assert any(g["start"].startswith("2020-02-19T23:38") and g["end"].startswith("2020-02-20T02:48") for g in s["gaps"]), s["gaps"]


def test_events_brief_and_review_roundtrip():
    d = api("GET", f"/patients/{PID}").json()
    assert len(d["events"]) >= 2
    for e in d["events"]:
        ev = api("GET", f"/events/{e['id']}").json()
        orig = ev["review"]
        b = api("POST", f"/events/{e['id']}/brief").json()
        assert b["source"] == "ai" and b["cached"] is True
        try:
            r = api("PUT", f"/events/{e['id']}/review", json={"note": "TEST_note iteration2", "status": "reviewed"})
            assert r.status_code == 200
            assert api("GET", f"/events/{e['id']}").json()["review"]["note"] == "TEST_note iteration2"
        finally:
            api("PUT", f"/events/{e['id']}/review", json={"note": "", "status": "unreviewed"})
        back = api("GET", f"/events/{e['id']}").json()["review"]
        assert back["status"] == "unreviewed" and back["note"] == ""
        assert orig["status"] == "unreviewed"
