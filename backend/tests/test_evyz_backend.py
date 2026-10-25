# EVYZ backend regression: auth/roles, import (preview/commit/reimport/mapping), detection, isolation, settings/recompute, brief, review
import os
import sys
import time
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(__file__))
from clerk_helper import token_for, find_or_create_user, CLINICIAN_ID, PENDING_EMAIL  # noqa: E402

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
FIXTURE = "/app/backend/tests/fixtures/SYNTHETIC_Dexcom_900.csv"
_env = dotenv_values("/app/backend/.env")
mdb = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
TEST_PIDS = ["900", "SYN-901", "TEST_MAP"]
STATE = {}


def hdr(uid=CLINICIAN_ID):
    return {"Authorization": f"Bearer {token_for(uid)}"}


def api(method, path, uid=CLINICIAN_ID, **kw):
    return requests.request(method, f"{BASE_URL}/api{path}", headers=hdr(uid), timeout=150, **kw)


def preview(path=FIXTURE, name=None, content=None):
    data = content if content is not None else open(path, "rb").read()
    return api("POST", "/imports/preview", files={"file": (name or os.path.basename(path), data, "text/csv")})


def set_role(role):
    mdb.users.update_one({"user_id": CLINICIAN_ID}, {"$set": {"role": role}})


@pytest.fixture(scope="module", autouse=True)
def clean_db():
    default_settings = mdb.settings.find_one({"id": "detector"})
    set_role("admin")
    for pid in TEST_PIDS:
        api("DELETE", f"/patients/{pid}")
    set_role("clinician")
    yield
    set_role("admin")
    for pid in TEST_PIDS:
        api("DELETE", f"/patients/{pid}")
    set_role("clinician")
    if default_settings is None:
        mdb.settings.delete_one({"id": "detector"})


# --- Auth / roles
class TestAuth:
    def test_unauth_401(self):
        for p in ["/patients", "/settings", "/me", "/imports"]:
            assert requests.get(f"{BASE_URL}/api{p}").status_code == 401

    def test_bad_token_401(self):
        r = requests.get(f"{BASE_URL}/api/patients", headers={"Authorization": "Bearer abc.def.ghi"})
        assert r.status_code == 401

    def test_pending_403(self):
        uid = find_or_create_user(PENDING_EMAIL)
        assert api("GET", "/me", uid=uid).json()["role"] == "pending"
        for m, p in [("GET", "/patients"), ("GET", "/settings"), ("POST", "/recompute")]:
            assert api(m, p, uid=uid).status_code == 403

    def test_clinician_cannot_admin(self):
        assert api("GET", "/users").status_code == 403
        assert api("DELETE", "/patients/nonexistent").status_code == 403

    def test_empty_overview(self):
        assert api("GET", "/patients").json() == []


# --- Import preview/commit/reimport + detection
class TestImport:
    def test_preview_fixture(self):
        r = preview()
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["suggested_participant_id"] == "900"
        assert d["accepted"] == 1135 and d["rejected"] == 2 and d["duplicates_in_file"] == 1
        assert d["data_label"] == "Synthetic test fixture"
        assert sum(d["skipped_non_reading_rows"].values()) == 3
        assert d["already_stored"] == 0 and d["new_readings"] == 1135
        STATE["import_id"] = d["import_id"]

    def test_commit(self):
        r = api("POST", f"/imports/{STATE['import_id']}/commit", json={"participant_id": "900"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["inserted"] == 1135 and d["detection"]["events"] == 1

    def test_detection(self):
        d = api("GET", "/patients/900").json()
        assert len(d["events"]) == 1
        ev = d["events"][0]
        assert ev["start"] == "2030-01-04T08:00:00" and ev["end"] == "2030-01-04T09:25:00"
        assert ev["direction"] == "above_baseline"
        STATE["eid"] = ev["id"]
        pts = {p["ts"]: p for p in api("GET", "/patients/900/series").json()["points"]}
        assert pts["2030-01-03T22:00:00"]["flag"] == "high"
        assert pts["2030-01-04T14:00:00"]["flag"] == "high"
        early = [p for t, p in pts.items() if t < "2030-01-03T00:00:00"]
        assert all(p["status"] == "insufficient_history" for p in early)
        assert pts["2030-01-03T00:05:00"]["status"] != "insufficient_history"

    def test_series_gap(self):
        gaps = api("GET", "/patients/900/series").json()["gaps"]
        assert any(g["start"].startswith("2030-01-04T14:1") for g in gaps)

    def test_reimport_no_new(self):
        d = preview().json()
        assert d["already_stored"] == 1135 and d["new_readings"] == 0
        r = api("POST", f"/imports/{d['import_id']}/commit", json={"participant_id": "900"}).json()
        assert r["inserted"] == 0 and r["duplicates_skipped"] == 1135
        assert len(api("GET", "/patients/900").json()["events"]) == 1

    def test_non_csv_rejected(self):
        assert preview(name="x.zip", content=b"abc").status_code == 400

    def test_bad_participant_id(self):
        d = preview().json()
        assert api("POST", f"/imports/{d['import_id']}/commit", json={"participant_id": "a b/c"}).status_code == 422


# --- Column mapping + units
class TestMapping:
    def test_needs_mapping_and_remap_mmol(self):
        csv = "when,reading\n2030-02-01 00:00:00,5.5\n2030-02-01 00:05:00,6.0\n2030-02-01 00:10:00,abc\n"
        d = preview(name="TEST_map.csv", content=csv.encode()).json()
        assert d["needs_mapping"] is True and d["problems"]
        r = api("POST", f"/imports/{d['import_id']}/remap", json={"mapping": {"timestamp_col": "when", "value_col": "reading", "unit": "mmol/L", "header_row": 0}})
        m = r.json()
        assert r.status_code == 200 and m["needs_mapping"] is False, m
        assert m["accepted"] == 2 and m["rejected"] == 1
        c = api("POST", f"/imports/{d['import_id']}/commit", json={"participant_id": "TEST_MAP"})
        assert c.status_code == 200, c.text
        vals = [p["value"] for p in api("GET", "/patients/TEST_MAP/series").json()["points"]]
        assert vals == [round(5.5 * 18.0182, 1), round(6.0 * 18.0182, 1)]

    def test_unsupported_unit(self):
        csv = "Timestamp,Glucose (mmol/mol)\n2030-02-01 00:00:00,40\n"
        d = preview(name="TEST_u.csv", content=csv.encode()).json()
        assert d["needs_mapping"] is True
        assert any("mmol/mol" in p for p in d["problems"])
        assert api("POST", f"/imports/{d['import_id']}/commit", json={"participant_id": "TEST_MAP"}).status_code == 400

    def test_remap_bad_header_row(self):
        d = preview(name="TEST_b.csv", content=b"when,reading\n2030-02-01 00:00:00,5\n").json()
        r = api("POST", f"/imports/{d['import_id']}/remap", json={"mapping": {"header_row": "abc"}})
        STATE["bad_header_status"] = r.status_code
        assert r.status_code in (400, 422), f"got {r.status_code}"


# --- Participant isolation
class TestIsolation:
    def test_second_participant(self):
        d = preview().json()
        assert api("POST", f"/imports/{d['import_id']}/commit", json={"participant_id": "SYN-901"}).status_code == 200
        e900 = api("GET", "/patients/900").json()["events"]
        e901 = api("GET", "/patients/SYN-901").json()["events"]
        assert len(e900) == 1 and len(e901) == 1 and e900[0]["id"] != e901[0]["id"]
        assert mdb.evaluations.count_documents({"patient_id": "900"}) == 1135
        assert mdb.evaluations.count_documents({"patient_id": "SYN-901"}) == 1135
        assert mdb.events.find_one({"id": e901[0]["id"]})["supporting_measurement_ids"] != mdb.events.find_one({"id": e900[0]["id"]})["supporting_measurement_ids"]


# --- AI brief + review + settings
class TestBriefReviewSettings:
    def test_brief_ai_and_cache(self):
        t = time.time()
        r = api("POST", f"/events/{STATE['eid']}/brief")
        assert r.status_code == 200, r.text
        d = r.json()
        print("brief", d["source"], d["generation_status"], d.get("validation_errors"), round(time.time() - t, 1))
        assert d["source"] == "ai" and d["generation_status"] == "valid" and d["cached"] is False
        r2 = api("POST", f"/events/{STATE['eid']}/brief").json()
        assert r2["cached"] is True and r2["id"] == d["id"]
        r3 = api("POST", f"/events/{STATE['eid']}/brief?force=true").json()
        assert r3["cached"] is True and r3["id"] == d["id"]

    def test_review_persist(self):
        r = api("PUT", f"/events/{STATE['eid']}/review", json={"note": "TEST_ note", "status": "reviewed"})
        assert r.status_code == 200
        d = api("GET", f"/events/{STATE['eid']}").json()
        assert d["review"]["note"] == "TEST_ note" and d["review"]["status"] == "reviewed"
        assert api("PUT", f"/events/{STATE['eid']}/review", json={"note": "x", "status": "bogus"}).status_code == 422
        p = [x for x in api("GET", "/patients").json() if x["id"] == "900"][0]
        assert p["unreviewed"] == 0

    def test_recompute_idempotent(self):
        v = mdb.events.find_one({"id": STATE["eid"]})["evidence_version"]
        assert api("POST", "/recompute").status_code == 200
        assert mdb.events.count_documents({"patient_id": "900"}) == 1
        assert mdb.events.find_one({"id": STATE["eid"]})["evidence_version"] == v
        assert api("GET", f"/events/{STATE['eid']}").json()["summary"] is not None

    def test_settings_change_bumps_version(self):
        s = api("GET", "/settings").json()
        vals = dict(s["values"])
        v0 = mdb.events.find_one({"id": STATE["eid"]})["evidence_version"]
        vals["min_band_mgdl"] = 25.0
        assert api("PUT", "/settings", json=vals).status_code == 200
        ev = mdb.events.find_one({"id": STATE["eid"]})
        assert ev["evidence_version"] == v0 + 1 and ev["active"]
        assert mdb.events.count_documents({"patient_id": "900"}) == 1
        assert mdb.summaries.find_one({"event_id": STATE["eid"], "evidence_version": v0})["outdated"] is True
        d = api("GET", f"/events/{STATE['eid']}").json()
        assert d["summary"] is None and d["review"]["status"] == "reviewed" and d["review"]["note"] == "TEST_ note"
        assert api("PUT", "/settings", json={**vals, "min_history_hours": 100}).status_code == 400
        assert api("PUT", "/settings", json=s["defaults"]).status_code == 200
        assert mdb.events.count_documents({"patient_id": "900"}) == 1

    def test_404s(self):
        assert api("GET", "/events/nope").status_code == 404
        assert api("GET", "/patients/nope").status_code == 404
        assert api("POST", "/imports/nope/commit", json={"participant_id": "x"}).status_code == 404
