import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import BulkWriteError
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent / ".env")

try:  # launched as `backend.server` (the default)
    from backend.clerk_auth import clerk_router, require_user
    from backend import importer, detector, brief, wearables
except ModuleNotFoundError:  # launched from inside backend/ as `server`
    from clerk_auth import clerk_router, require_user
    import importer
    import detector
    import brief
    import wearables

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="EVYZ")
api = APIRouter(prefix="/api")
logger = logging.getLogger("evyz")
MAX_UPLOAD = 15 * 1024 * 1024


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------- Access control ----------------
ROLES = ["admin", "clinician", "pending"]
DEFAULT_ROLE = "pending"
RETIRED_ROLES = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


def _clerk_profile(user_id: str):
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    r = requests.get(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"})
    r.raise_for_status()
    emails = r.json()["email_addresses"]
    is_admin = any(e["email_address"].lower() in admins and (e.get("verification") or {}).get("status") == "verified" for e in emails)
    return (emails[0]["email_address"] if emails else ""), is_admin


async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role"):
        email, is_admin = await run_in_threadpool(_clerk_profile, uid)
        role = "admin" if is_admin else DEFAULT_ROLE
        await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role, "email": email}})
        member = await db.users.find_one_and_update(
            {"user_id": uid}, {"$setOnInsert": {"user_id": uid, "role": role, "email": email, "created_at": now_iso()}},
            upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Your account is waiting for approval by an EVYZ admin.")
        return member
    return check


staff = require_role("admin", "clinician")


@api.get("/me")
async def me(member: dict = Depends(current_member)):
    return {"user_id": member["user_id"], "email": member.get("email"), "role": member["role"]}


@api.get("/users")
async def list_users(admin: dict = Depends(require_role("admin"))):
    people = await db.users.find(IN_ENV, {"_id": 0}).to_list(1000)
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[admin["role"]]],
            "users": [{**p, "role": effective_role(p.get("role"))} for p in people]}


class RoleIn(BaseModel):
    role: str


@api.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: dict = Depends(require_role("admin"))):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(status_code=403, detail="Not allowed")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(status_code=404, detail="Not found")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(status_code=409, detail="Keep at least one admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}


# ---------------- Settings ----------------
async def get_settings() -> dict:
    doc = await db.settings.find_one({"id": "detector"}, {"_id": 0})
    return {**detector.DEFAULT_SETTINGS, **(doc or {}).get("values", {})}


class SettingsIn(BaseModel):
    baseline_hours: float = Field(ge=6, le=336)
    min_history_hours: float = Field(ge=1, le=336)
    min_coverage: float = Field(ge=0.1, le=1.0)
    mad_multiplier: float = Field(ge=0.5, le=10)
    mad_scale: float = Field(ge=0.1, le=5)
    min_band_mgdl: float = Field(ge=0, le=200)
    min_event_minutes: float = Field(ge=5, le=1440)
    gap_factor: float = Field(ge=1, le=10)


@api.get("/settings")
async def read_settings(_: dict = Depends(staff)):
    s = await get_settings()
    return {"values": s, "defaults": detector.DEFAULT_SETTINGS, "version": detector.detector_version(s)}


async def recompute_all():
    s = await get_settings()
    return {p["id"]: await detector.recompute_patient(db, p["id"], s) for p in await db.patients.find({}, {"_id": 0, "id": 1}).to_list(None)}


@api.put("/settings")
async def write_settings(body: SettingsIn, _: dict = Depends(staff)):
    if body.min_history_hours > body.baseline_hours:
        raise HTTPException(400, "Minimum history cannot exceed the baseline window.")
    await db.settings.update_one({"id": "detector"}, {"$set": {"values": body.model_dump(), "updated_at": now_iso()}}, upsert=True)
    return {"recomputed": await recompute_all()}


@api.post("/recompute")
async def recompute(_: dict = Depends(staff)):
    return {"recomputed": await recompute_all()}


# ---------------- Import ----------------
def _preview_view(staging: dict, p: dict) -> dict:
    return {
        "import_id": staging["id"], "filename": staging["filename"], "suggested_participant_id": staging["suggested_participant_id"],
        "data_label": staging["data_label"], **{k: v for k, v in p.items() if k != "readings"},
    }


async def _with_db_duplicates(view: dict, p: dict, participant_id: Optional[str]):
    view["already_stored"] = 0
    if participant_id and p["readings"]:
        ts = [r["ts"] for r in p["readings"]]
        view["already_stored"] = await db.measurements.count_documents({"patient_id": participant_id, "metric": "glucose", "ts": {"$in": ts}})
    view["new_readings"] = view.get("accepted", 0) - view["already_stored"]
    return view


@api.post("/imports/preview")
async def import_preview(file: UploadFile = File(...), _: dict = Depends(staff)):
    raw = await file.read(MAX_UPLOAD + 1)
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "File is larger than 15 MB. Upload one participant's CSV at a time.")
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, "Upload a .csv file (ZIP archives are not supported — extract the CSV first).")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "The file is not UTF-8 text. Export the CSV as UTF-8 and try again.")
    synthetic = "synthetic" in file.filename.lower()
    staging = {
        "id": str(uuid.uuid4()), "filename": file.filename, "raw": text, "mapping": None,
        "suggested_participant_id": importer.suggest_participant(file.filename),
        "data_label": "Synthetic test fixture" if synthetic else "Historical research data", "created_at": now_iso(),
        "created_dt": datetime.now(timezone.utc),
    }
    p = importer.parse_csv(text, None)
    await db.import_staging.insert_one(staging)
    return await _with_db_duplicates(_preview_view(staging, p), p, staging["suggested_participant_id"])


class MappingIn(BaseModel):
    header_row: int = Field(default=0, ge=0, le=1000)
    timestamp_col: Optional[str] = None
    value_col: Optional[str] = None
    unit: Optional[Literal["mg/dL", "mmol/L"]] = None
    unit_in_header: Optional[str] = None
    event_type_col: Optional[str] = None
    event_type_value: Optional[str] = None
    source_col: Optional[str] = None


class RemapIn(BaseModel):
    mapping: MappingIn = MappingIn()
    participant_id: Optional[str] = None


@api.post("/imports/{import_id}/remap")
async def import_remap(import_id: str, body: RemapIn, _: dict = Depends(staff)):
    st = await db.import_staging.find_one({"id": import_id}, {"_id": 0})
    if not st:
        raise HTTPException(404, "Import session expired. Upload the file again.")
    mapping = body.mapping.model_dump()
    await db.import_staging.update_one({"id": import_id}, {"$set": {"mapping": mapping}})
    p = importer.parse_csv(st["raw"], mapping)
    return await _with_db_duplicates(_preview_view(st, p), p, (body.participant_id or st["suggested_participant_id"] or "").strip() or None)


class CommitIn(BaseModel):
    participant_id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_\-.]+$")


@api.post("/imports/{import_id}/commit")
async def import_commit(import_id: str, body: CommitIn, member: dict = Depends(staff)):
    st = await db.import_staging.find_one({"id": import_id}, {"_id": 0})
    if not st:
        raise HTTPException(404, "Import session expired. Upload the file again.")
    p = importer.parse_csv(st["raw"], st.get("mapping"))
    if p["needs_mapping"]:
        raise HTTPException(400, "Resolve the column mapping problems before importing: " + " ".join(p["problems"]))
    if not p["readings"]:
        raise HTTPException(400, "No valid glucose readings found in this file.")
    pid = body.participant_id.strip()
    docs = [{
        "id": importer.measurement_id(pid, "glucose", r["ts"]), "patient_id": pid, "metric": "glucose",
        "ts": r["ts"], "tz_offset": r["tz_offset"], "value": r["value"], "unit": "mg/dL",
        "original_value": r["original_value"], "original_unit": r["original_unit"], "source": r["source"],
        "import_id": import_id, "data_label": st["data_label"], "created_at": now_iso(),
    } for r in p["readings"]]
    inserted = 0
    try:
        res = await db.measurements.insert_many(docs, ordered=False)
        inserted = len(res.inserted_ids)
    except BulkWriteError as e:
        inserted = e.details.get("nInserted", 0)
    await db.patients.update_one({"id": pid}, {"$setOnInsert": {"id": pid, "data_label": st["data_label"], "created_at": now_iso()}}, upsert=True)
    record = {
        "id": import_id, "patient_id": pid, "filename": st["filename"], "data_label": st["data_label"],
        "accepted": p["accepted"], "inserted": inserted, "duplicates_skipped": p["accepted"] - inserted,
        "duplicates_in_file": p["duplicates_in_file"], "rejected": p["rejected"], "rejected_reasons": p["rejected_reasons"],
        "date_range": p["date_range"], "unit": p["unit"], "mapping": p["mapping"], "imported_by": member.get("email"), "created_at": now_iso(),
    }
    await db.imports.replace_one({"id": import_id}, record, upsert=True)
    await db.import_staging.delete_one({"id": import_id})
    result = await detector.recompute_patient(db, pid, await get_settings())
    return {**record, "detection": result}


@api.get("/imports")
async def list_imports(_: dict = Depends(staff)):
    return await db.imports.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------------- Patients ----------------
async def _review_map(event_ids):
    return {r["event_id"]: r for r in await db.reviews.find({"event_id": {"$in": list(event_ids)}}, {"_id": 0}).to_list(None)}


async def _summary_map(events):
    out = {}
    for s in await db.summaries.find({"event_id": {"$in": [e["id"] for e in events]}}, {"_id": 0, "event_id": 1, "evidence_version": 1, "source": 1}).to_list(None):
        ev = next(e for e in events if e["id"] == s["event_id"])
        if s["evidence_version"] == ev["evidence_version"]:
            out[s["event_id"]] = s["source"]
    return out


def _coverage(n, first_ts, last_ts, cadence):
    if not cadence or n < 2:
        return None
    span = detector.to_secs(last_ts) - detector.to_secs(first_ts)
    return round(min(n / (span / cadence + 1), 1.0), 3)


@api.get("/patients")
async def list_patients(_: dict = Depends(staff)):
    rows = []
    for p in await db.patients.find({}, {"_id": 0}).to_list(None):
        pid = p["id"]
        n = await db.measurements.count_documents({"patient_id": pid, "metric": "glucose"})
        first = await db.measurements.find_one({"patient_id": pid, "metric": "glucose"}, {"_id": 0, "ts": 1}, sort=[("ts", 1)])
        last = await db.measurements.find_one({"patient_id": pid, "metric": "glucose"}, {"_id": 0, "ts": 1, "value": 1, "unit": 1}, sort=[("ts", -1)])
        events = await db.events.find({"patient_id": pid, "active": True}, {"_id": 0, "id": 1, "start": 1, "evidence_version": 1}).to_list(None)
        reviews = await _review_map(e["id"] for e in events)
        unreviewed = [e for e in events if reviews.get(e["id"], {}).get("status") != "reviewed"]
        summaries = await _summary_map(events)
        rows.append({
            "id": pid, "data_label": p.get("data_label"), "readings": n,
            "first_ts": first["ts"] if first else None, "latest": last,
            "coverage": _coverage(n, first["ts"], last["ts"], p.get("cadence_seconds")) if first else None,
            "cadence_seconds": p.get("cadence_seconds"),
            "events_total": len(events), "unreviewed": len(unreviewed),
            "newest_unreviewed_start": max((e["start"] for e in unreviewed), default=None),
            "ai_summaries": sum(1 for v in summaries.values() if v == "ai"), "template_summaries": sum(1 for v in summaries.values() if v == "template"),
        })
    rows.sort(key=lambda r: (r["newest_unreviewed_start"] is not None, r["newest_unreviewed_start"] or "", r["id"]), reverse=True)
    return rows


async def _patient_or_404(pid):
    p = await db.patients.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, f"Participant {pid} not found")
    return p


@api.get("/patients/{pid}")
async def patient_detail(pid: str, _: dict = Depends(staff)):
    p = await _patient_or_404(pid)
    events = await db.events.find({"patient_id": pid, "active": True}, {"_id": 0, "evidence_hash": 0, "supporting_measurement_ids": 0}).sort("start", -1).to_list(None)
    reviews = await _review_map(e["id"] for e in events)
    summaries = await _summary_map(events)
    for e in events:
        e["review_status"] = reviews.get(e["id"], {}).get("status", "unreviewed")
        e["summary_source"] = summaries.get(e["id"])
    imports = await db.imports.find({"patient_id": pid}, {"_id": 0, "mapping": 0}).sort("created_at", -1).to_list(50)
    insufficient = await db.evaluations.count_documents({"patient_id": pid, "status": "insufficient_history"})
    evaluated = await db.evaluations.count_documents({"patient_id": pid})
    return {**p, "events": events, "imports": imports, "insufficient_count": insufficient, "evaluated_count": evaluated,
            "settings": await get_settings()}


def _gaps(rows, cadence, factor):
    if not cadence:
        return []
    out = []
    for a, b in zip(rows, rows[1:]):
        d = detector.to_secs(b["ts"]) - detector.to_secs(a["ts"])
        if d > factor * cadence:
            out.append({"start": a["ts"], "end": b["ts"], "minutes": round(d / 60, 1)})
    return out


@api.get("/patients/{pid}/series")
async def patient_series(pid: str, _: dict = Depends(staff)):
    p = await _patient_or_404(pid)
    ms = await db.measurements.find({"patient_id": pid, "metric": "glucose"}, {"_id": 0, "id": 1, "ts": 1, "value": 1}).sort("ts", 1).to_list(None)
    evals = {e["measurement_id"]: e for e in await db.evaluations.find({"patient_id": pid}, {"_id": 0, "measurement_id": 1, "median": 1, "lower": 1, "upper": 1, "flag": 1, "status": 1}).to_list(None)}
    s = await get_settings()
    points = [{**m, **{k: evals.get(m["id"], {}).get(k) for k in ("median", "lower", "upper", "flag", "status")}} for m in ms]
    return {"unit": "mg/dL", "cadence_seconds": p.get("cadence_seconds"), "points": points, "gaps": _gaps(ms, p.get("cadence_seconds"), s["gap_factor"])}


@api.delete("/patients/{pid}")
async def delete_patient(pid: str, _: dict = Depends(require_role("admin"))):
    await _patient_or_404(pid)
    eids = [e["id"] for e in await db.events.find({"patient_id": pid}, {"_id": 0, "id": 1}).to_list(None)]
    for coll in ("measurements", "evaluations", "events", "imports", "measurement_aggregates", "aggregate_conflicts"):
        await db[coll].delete_many({"patient_id": pid})
    await db.reviews.delete_many({"event_id": {"$in": eids}})
    await db.summaries.delete_many({"event_id": {"$in": eids}})
    await db.patients.delete_one({"id": pid})
    return {"deleted": pid}


# ---------------- Contextual wearable data (heart rate, skin temperature) ----------------
DATA_DIR = Path(os.environ["SERVER_DATA_DIR"])


@api.get("/server-files")
async def server_files(_: dict = Depends(staff)):
    out = []
    for f in sorted(DATA_DIR.glob("*.csv")):
        metric, pid = wearables.metric_for_file(f.name)
        if not metric:
            continue
        prev = await db.imports.find_one({"filename": f.name, "kind": "server_file"}, {"_id": 0, "created_at": 1, "patient_id": 1}, sort=[("created_at", -1)])
        out.append({"filename": f.name, "metric": metric, "label": wearables.METRICS[metric]["label"],
                    "size_bytes": f.stat().st_size, "suggested_participant_id": pid, "last_import": prev})
    return out


class ServerImportIn(BaseModel):
    filename: str
    participant_id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_\-.]+$")


@api.post("/server-files/import")
async def server_file_import(body: ServerImportIn, member: dict = Depends(staff)):
    metric, _pid = wearables.metric_for_file(body.filename)
    path = DATA_DIR / body.filename
    if not metric or not path.is_file() or path.parent != DATA_DIR:
        raise HTTPException(404, "File not found on the server, or not a recognised HR_/TEMP_ CSV.")
    if not await db.patients.find_one({"id": body.participant_id}):
        raise HTTPException(400, f"Participant {body.participant_id} does not exist. Import their glucose CSV first.")
    sha = await run_in_threadpool(wearables.file_sha256, path)
    pid = body.participant_id
    import_id = hashlib.sha1(f"{pid}|{metric}|{sha}".encode()).hexdigest()[:20]
    prev = await db.imports.find_one({"id": import_id}, {"_id": 0})
    if prev:
        prev.update(already_imported=True, inserted=0, reprocessed=False,
                    note="Identical file (same SHA-256) already imported for this participant; nothing added. Counts shown are from the original import.")
        return prev
    try:
        rep = await run_in_threadpool(wearables.aggregate_file, path, metric)
    except ValueError as e:
        raise HTTPException(400, str(e))
    source = rep["source"]
    docs = [{**a, "id": hashlib.sha1(f"{pid}|{metric}|{sha}|{a['ts']}".encode()).hexdigest()[:20], "patient_id": pid,
             "metric": metric, "source": source, "unit": rep["unit"], "unit_status": rep["unit_status"], "interval": "1min",
             "source_file": body.filename, "source_sha256": sha,
             "import_id": import_id, "data_label": "Historical research data"} for a in rep["aggregates"]]
    # Conflict check before writing: same participant + metric + source + minute.
    existing = {d["ts"]: d for d in await db.measurement_aggregates.find(
        {"patient_id": pid, "metric": metric, "source": source, "ts": {"$in": [d["ts"] for d in docs]}},
        {"_id": 0, "ts": 1, "mean": 1, "min": 1, "max": 1, "count": 1, "import_id": 1, "source_file": 1}).to_list(None)}
    new_docs, identical, conflicts = [], 0, []
    for d in docs:
        old = existing.get(d["ts"])
        if old is None:
            new_docs.append(d)
        elif all(old[k] == d[k] for k in ("mean", "min", "max", "count")):
            identical += 1
        else:
            conflicts.append({
                "id": hashlib.sha1(f"{import_id}|{d['ts']}".encode()).hexdigest()[:20], "patient_id": pid, "metric": metric,
                "source": source, "ts": d["ts"], "status": "needs_review",
                "existing": {k: old.get(k) for k in ("mean", "min", "max", "count", "import_id", "source_file")},
                "incoming": {k: d[k] for k in ("mean", "min", "max", "count", "import_id", "source_file", "source_line_ranges")},
                "created_at": now_iso(),
            })
    inserted = 0
    if new_docs:
        try:
            inserted = len((await db.measurement_aggregates.insert_many(new_docs, ordered=False)).inserted_ids)
        except BulkWriteError as e:
            inserted = e.details.get("nInserted", 0)
    for c in conflicts:
        await db.aggregate_conflicts.replace_one({"id": c["id"]}, c, upsert=True)
    gaps = wearables.minute_gaps(rep["aggregates"])
    record = {
        "id": import_id, "kind": "server_file", "patient_id": pid, "metric": metric, "filename": body.filename,
        "source_sha256": sha, "size_bytes": path.stat().st_size, "data_label": "Historical research data",
        **{k: v for k, v in rep.items() if k != "aggregates"},
        "date_range": {"start": rep["aggregates"][0]["ts"], "end": rep["aggregates"][-1]["ts"]} if docs else None,
        "aggregates": len(docs), "inserted": inserted, "identical_skipped": identical, "conflicts_flagged": len(conflicts),
        "conflict_samples": [{"ts": c["ts"], "existing": c["existing"], "incoming": {k: c["incoming"][k] for k in ("mean", "min", "max", "count")}} for c in conflicts[:5]],
        "gaps": len(gaps), "gap_minutes_total": round(sum(g["minutes"] for g in gaps), 1),
        "imported_by": member.get("email"), "created_at": now_iso(),
    }
    await db.imports.replace_one({"id": import_id}, record, upsert=True)
    return record


@api.get("/patients/{pid}/context/{metric}")
async def patient_context(pid: str, metric: Literal["heart_rate", "skin_temperature"], _: dict = Depends(staff)):
    await _patient_or_404(pid)
    rows = await db.measurement_aggregates.find({"patient_id": pid, "metric": metric},
                                                {"_id": 0, "ts": 1, "mean": 1, "min": 1, "max": 1, "count": 1}).sort("ts", 1).to_list(None)
    spec = wearables.METRICS[metric]
    conflicts = await db.aggregate_conflicts.find({"patient_id": pid, "metric": metric, "status": "needs_review"},
                                                  {"_id": 0, "ts": 1, "existing": 1, "incoming": 1}).sort("ts", 1).to_list(200)
    return {"metric": metric, "label": spec["label"], **{k: spec[k] for k in wearables.UNIT_FIELDS}, "source": spec["source"],
            "interval": "1min", "points": rows, "gaps": wearables.minute_gaps(rows),
            "conflicts_count": await db.aggregate_conflicts.count_documents({"patient_id": pid, "metric": metric, "status": "needs_review"}),
            "conflicts": conflicts[:20]}


# ---------------- Events ----------------
async def _event_or_404(eid):
    ev = await db.events.find_one({"id": eid}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Event not found")
    return ev


async def _event_readings(ev):
    ms = await db.measurements.find({"id": {"$in": ev["supporting_measurement_ids"]}}, {"_id": 0, "id": 1, "ts": 1, "value": 1, "unit": 1, "source": 1}).sort("ts", 1).to_list(None)
    evals = {e["measurement_id"]: e for e in await db.evaluations.find({"measurement_id": {"$in": ev["supporting_measurement_ids"]}, "patient_id": ev["patient_id"]}, {"_id": 0}).to_list(None)}
    return [{**m, **{k: evals.get(m["id"], {}).get(k) for k in ("median", "lower", "upper", "flag", "n_baseline", "coverage")}} for m in ms]


async def _gaps_near(ev, cadence, factor):
    lo = (datetime.fromisoformat(ev["baseline"]["window_start"])).isoformat()
    hi = ev["end"]
    rows = await db.measurements.find({"patient_id": ev["patient_id"], "metric": "glucose", "ts": {"$gte": lo, "$lte": hi}}, {"_id": 0, "ts": 1}).sort("ts", 1).to_list(None)
    return _gaps(rows, cadence, factor)


@api.get("/events/{eid}")
async def event_detail(eid: str, _: dict = Depends(staff)):
    ev = await _event_or_404(eid)
    p = await _patient_or_404(ev["patient_id"])
    review = await db.reviews.find_one({"event_id": eid}, {"_id": 0}) or {"event_id": eid, "note": "", "status": "unreviewed", "reviewed_at": None}
    summary = await db.summaries.find_one({"event_id": eid, "evidence_version": ev["evidence_version"]}, {"_id": 0})
    ev.pop("evidence_hash", None)
    return {"event": ev, "readings": await _event_readings(ev), "review": review, "summary": summary,
            "gaps": await _gaps_near(ev, p.get("cadence_seconds"), ev["detector"]["settings"]["gap_factor"]),
            "cadence_seconds": p.get("cadence_seconds"), "data_label": p.get("data_label")}


@api.post("/events/{eid}/brief")
async def event_brief(eid: str, force: bool = False, _: dict = Depends(staff)):
    ev = await _event_or_404(eid)
    cached = await db.summaries.find_one({"event_id": eid, "evidence_version": ev["evidence_version"]}, {"_id": 0})
    if cached and not (force and cached["source"] == "template"):
        return {**cached, "cached": True}
    p = await _patient_or_404(ev["patient_id"])
    readings = await _event_readings(ev)
    gaps = await _gaps_near(ev, p.get("cadence_seconds"), ev["detector"]["settings"]["gap_factor"])
    packet = brief.build_packet(ev, readings, gaps, p.get("cadence_seconds"))
    nxt = await db.measurements.find_one({"patient_id": ev["patient_id"], "metric": "glucose", "ts": {"$gt": ev["end"]}}, {"_id": 0, "id": 1, "ts": 1, "value": 1}, sort=[("ts", 1)])
    if nxt:
        packet["first_reading_after_event"] = nxt
        packet["reference_ids"].append(nxt["id"])
    result = await brief.generate_brief(packet)
    doc = {"id": str(uuid.uuid4()), "event_id": eid, "evidence_version": ev["evidence_version"], "prompt_version": brief.PROMPT_VERSION,
           **result, "evidence_ref_ids": packet["reference_ids"], "outdated": False, "created_at": now_iso()}
    await db.summaries.replace_one({"event_id": eid, "evidence_version": ev["evidence_version"]}, doc, upsert=True)
    doc.pop("_id", None)
    return {**doc, "cached": False}


class ReviewIn(BaseModel):
    note: str = Field(default="", max_length=5000)
    status: Literal["unreviewed", "reviewed"]


@api.put("/events/{eid}/review")
async def save_review(eid: str, body: ReviewIn, member: dict = Depends(staff)):
    ev = await _event_or_404(eid)
    doc = {"event_id": eid, "patient_id": ev["patient_id"], "note": body.note, "status": body.status,
           "reviewed_at": now_iso() if body.status == "reviewed" else None,
           "reviewer": member.get("email"), "evidence_version_at_review": ev["evidence_version"], "updated_at": now_iso()}
    await db.reviews.update_one({"event_id": eid}, {"$set": doc}, upsert=True)
    return doc


@app.on_event("startup")
async def startup():
    await db.measurements.create_index([("patient_id", 1), ("metric", 1), ("ts", 1)], unique=True)
    await db.measurements.create_index("id", unique=True)
    await db.evaluations.create_index([("patient_id", 1), ("measurement_id", 1)])
    await db.events.create_index("id", unique=True)
    await db.events.create_index("patient_id")
    await db.reviews.create_index("event_id", unique=True)
    await db.summaries.create_index([("event_id", 1), ("evidence_version", 1)], unique=True)
    await db.patients.create_index("id", unique=True)
    await db.measurement_aggregates.create_index("id", unique=True)
    for m, spec in wearables.METRICS.items():
        await db.measurement_aggregates.update_many({"metric": m, "source": {"$exists": False}}, {"$set": {"source": spec["source"]}})
        await db.measurement_aggregates.update_many({"metric": m}, {"$set": {"unit_status": spec["unit_status"]}})
        await db.imports.update_many({"kind": "server_file", "metric": m}, {"$set": {k: spec[k] for k in wearables.UNIT_FIELDS}, "$unset": {"unit_basis": ""}})
    await db.measurement_aggregates.create_index([("patient_id", 1), ("metric", 1), ("source", 1), ("ts", 1)], unique=True, name="uniq_minute_per_source")
    await db.aggregate_conflicts.create_index("id", unique=True)
    await db.measurement_aggregates.create_index([("patient_id", 1), ("metric", 1), ("ts", 1)])
    await db.import_staging.create_index("created_dt", expireAfterSeconds=6 * 3600)
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})


@api.get("/research/eeg-calibration")
async def eeg_calibration_results(_: dict = Depends(staff)):
    """Read-only: serves the saved research results file. Separate from the clinic database."""
    path = Path(os.environ["RESEARCH_RESULTS_PATH"])
    try:
        data = json.loads(await run_in_threadpool(path.read_text))
    except (OSError, json.JSONDecodeError):
        raise HTTPException(503, "EEG benchmark results are unavailable (results file missing or unreadable).")
    if not data.get("folds"):
        raise HTTPException(503, "EEG benchmark results file contains no folds.")
    return {"source_file": path.name, **data}


@api.get("/health")
async def health():
    return {"ok": True, "llm_configured": bool(os.environ.get("EMERGENT_LLM_KEY")), "model": os.environ.get("LLM_MODEL")}


app.include_router(api)
app.include_router(clerk_router)
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"],
)
