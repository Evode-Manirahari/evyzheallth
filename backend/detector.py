"""Transparent personal-baseline change detector (median / MAD). No AI involved."""
import hashlib
import json
from datetime import datetime, timezone

import numpy as np

DETECTOR_NAME = "evyz-glucose-mad"
DETECTOR_CODE_VERSION = "1.0"
EPOCH = datetime(1970, 1, 1)

DEFAULT_SETTINGS = {
    "baseline_hours": 72.0,
    "min_history_hours": 48.0,
    "min_coverage": 0.70,
    "mad_multiplier": 3.0,
    "mad_scale": 1.4826,
    "min_band_mgdl": 20.0,
    "min_event_minutes": 30.0,
    "gap_factor": 2.0,
}


def detector_version(s: dict) -> str:
    h = hashlib.sha1(json.dumps(s, sort_keys=True).encode()).hexdigest()[:8]
    return f"{DETECTOR_NAME}-{DETECTOR_CODE_VERSION}-{h}"


def to_secs(ts: str) -> float:
    return (datetime.fromisoformat(ts) - EPOCH).total_seconds()


def expected_cadence(secs: np.ndarray):
    d = np.diff(secs)
    d = d[d > 0]
    return float(np.median(d)) if len(d) else None


def evaluate(readings: list, s: dict):
    """readings sorted by ts. Baseline for reading i uses only readings strictly before it."""
    if not readings:
        return [], None
    secs = np.array([to_secs(r["ts"]) for r in readings])
    vals = np.array([r["value"] for r in readings], dtype=float)
    cadence = expected_cadence(secs)
    W = s["baseline_hours"] * 3600
    first, lo, out = secs[0], 0, []
    for i, r in enumerate(readings):
        t = secs[i]
        while secs[lo] < t - W:
            lo += 1
        win = vals[lo:i]
        span = t - first
        expected = (min(W, span) / cadence) if cadence else 0
        coverage = (len(win) / expected) if expected > 0 else 0.0
        e = {
            "measurement_id": r["id"], "ts": r["ts"], "value": r["value"],
            "n_baseline": int(len(win)), "coverage": round(min(coverage, 1.0), 3),
            "history_hours": round(span / 3600, 2),
            "window_start": _iso(t - W),
            "median": None, "mad": None, "lower": None, "upper": None, "flag": None,
        }
        if span < s["min_history_hours"] * 3600 or coverage < s["min_coverage"] or len(win) == 0:
            e["status"] = "insufficient_history"
        else:
            med = float(np.median(win))
            mad = float(np.median(np.abs(win - med)))
            half = max(s["mad_multiplier"] * s["mad_scale"] * mad, s["min_band_mgdl"])
            e.update(median=round(med, 2), mad=round(mad, 2), lower=round(med - half, 2), upper=round(med + half, 2),
                     half_width=round(half, 2))
            v = r["value"]
            e["flag"] = "high" if v > med + half else ("low" if v < med - half else None)
            e["status"] = "flagged" if e["flag"] else "in_band"
        e["_secs"] = t
        out.append(e)
    return out, cadence


def _iso(secs: float) -> str:
    return datetime.fromtimestamp(secs, tz=timezone.utc).replace(tzinfo=None).isoformat()


def find_runs(evals: list, cadence: float, s: dict):
    runs, cur = [], []
    gap_limit = s["gap_factor"] * cadence if cadence else float("inf")

    def close(reason):
        if cur and (cur[-1]["_secs"] - cur[0]["_secs"]) >= s["min_event_minutes"] * 60:
            runs.append((list(cur), reason))

    for e in evals:
        if cur and e["_secs"] - cur[-1]["_secs"] > gap_limit:
            close("data_gap")
            cur = []
        if e["flag"] is None:
            if cur:
                close("returned_to_band" if e["status"] == "in_band" else "insufficient_history")
                cur = []
            continue
        if cur and e["flag"] != cur[0]["flag"]:
            close("direction_change")
            cur = []
        cur.append(e)
    if cur:
        close("ongoing_at_end_of_data")
    return runs


def build_event(patient_id: str, run: list, reason: str, s: dict, version: str):
    first, last = run[0], run[-1]
    direction = "above_baseline" if first["flag"] == "high" else "below_baseline"
    vals = np.array([e["value"] for e in run])
    peak = max(run, key=lambda e: abs(e["value"] - first["median"]))
    baseline = {k: first[k] for k in ("median", "mad", "lower", "upper", "half_width", "n_baseline", "coverage")}
    baseline.update(window_start=first["window_start"], window_end=first["ts"])
    observed = {
        "n_readings": len(run), "min": float(vals.min()), "max": float(vals.max()),
        "mean": round(float(vals.mean()), 1), "median": round(float(np.median(vals)), 1),
        "peak_value": peak["value"], "peak_ts": peak["ts"],
        "peak_deviation_from_baseline_median": round(peak["value"] - first["median"], 1),
    }
    evidence = {
        "start": first["ts"], "end": last["ts"], "direction": direction,
        "duration_minutes": round((last["_secs"] - first["_secs"]) / 60, 1),
        "end_reason": reason, "baseline": baseline, "observed": observed,
        "supporting_measurement_ids": [e["measurement_id"] for e in run],
        "detector": {"version": version, "settings": s},
    }
    event_id = hashlib.sha1(f"{patient_id}|glucose|{first['ts']}|{direction}".encode()).hexdigest()[:16]
    evidence_hash = hashlib.sha1(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
    return {"id": event_id, "patient_id": patient_id, "metric": "glucose", **evidence, "evidence_hash": evidence_hash}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def recompute_patient(db, patient_id: str, s: dict):
    version = detector_version(s)
    readings = await db.measurements.find(
        {"patient_id": patient_id, "metric": "glucose"}, {"_id": 0, "id": 1, "ts": 1, "value": 1}
    ).sort("ts", 1).to_list(None)
    evals, cadence = evaluate(readings, s)
    await db.evaluations.delete_many({"patient_id": patient_id})
    if evals:
        await db.evaluations.insert_many(
            [{**{k: v for k, v in e.items() if k != "_secs"}, "patient_id": patient_id, "detector_version": version} for e in evals]
        )
    new_events = [build_event(patient_id, run, reason, s, version) for run, reason in (find_runs(evals, cadence, s) if cadence else [])]
    existing = {e["id"]: e for e in await db.events.find({"patient_id": patient_id}, {"_id": 0}).to_list(None)}
    seen = set()
    for ev in new_events:
        seen.add(ev["id"])
        old = existing.get(ev["id"])
        if old is None:
            await db.events.insert_one({**ev, "evidence_version": 1, "active": True, "created_at": now_iso(), "updated_at": now_iso()})
        elif old["evidence_hash"] != ev["evidence_hash"] or not old.get("active"):
            nv = old["evidence_version"] + (1 if old["evidence_hash"] != ev["evidence_hash"] else 0)
            await db.events.update_one({"id": ev["id"]}, {"$set": {**ev, "evidence_version": nv, "active": True, "updated_at": now_iso()}})
            await db.summaries.update_many({"event_id": ev["id"], "evidence_version": {"$lt": nv}}, {"$set": {"outdated": True}})
    for eid, old in existing.items():
        if eid not in seen and old.get("active"):
            await db.events.update_one({"id": eid}, {"$set": {"active": False, "superseded_at": now_iso()}})
            await db.summaries.update_many({"event_id": eid}, {"$set": {"outdated": True}})
    await db.patients.update_one(
        {"id": patient_id},
        {"$set": {"cadence_seconds": cadence, "detector_version": version, "last_computed_at": now_iso()}},
    )
    return {"readings": len(readings), "events": len(new_events), "cadence_seconds": cadence}
