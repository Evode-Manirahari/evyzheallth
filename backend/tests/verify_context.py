"""Verifies HR/TEMP server imports for participant 001 against raw source rows (uses preview DB via API)."""
import csv
import json
import os
import random
import urllib.request

import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0] + "/api"
UID = "user_3LA20sZnJyrR2GiMtpaUYrdo6AH"


def clerk(p, body):
    req = urllib.request.Request("https://api.clerk.com/v1" + p, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "t"})
    return json.load(urllib.request.urlopen(req))


tok = clerk(f"/sessions/{clerk('/sessions', {'user_id': UID})['id']}/tokens", {"expires_in_seconds": 900})["jwt"]
H = {"Authorization": "Bearer " + tok}

print("server files:", [(f["filename"], f["suggested_participant_id"]) for f in requests.get(f"{API}/server-files", headers=H).json()])
print("glucose imports for 001:", [(i["filename"], i.get("kind", "csv_upload")) for i in requests.get(f"{API}/imports", headers=H).json() if i["patient_id"] == "001"])
reports = {}
for fn in ("HR_001.csv", "TEMP_001.csv"):
    for attempt in (1, 2):
        r = requests.post(f"{API}/server-files/import", headers=H, json={"filename": fn, "participant_id": "001"}, timeout=600).json()
        keep = ("raw_rows", "valid_rows", "invalid_rows", "invalid_reasons", "aggregates", "inserted", "duplicates_skipped", "gaps",
                "gap_minutes_total", "date_range", "first_raw_timestamp", "last_raw_timestamp", "observed_value_range", "unit")
        print(fn, f"import #{attempt}", {k: r.get(k) for k in keep})
    reports[fn] = r

# Spot-check: recompute 3 random minutes directly from raw rows
for fn, metric in (("HR_001.csv", "heart_rate"), ("TEMP_001.csv", "skin_temperature")):
    pts = requests.get(f"{API}/patients/001/context/{metric}", headers=H).json()["points"]
    picks = random.Random(7).sample(pts, 3)
    for p in picks:
        y, mo, d = p["ts"][:10].split("-")
        hm = p["ts"][11:16]
        key = f"{int(mo)}/{int(d)}/{y[2:]} {int(hm[:2])}:{hm[3:]}" if metric == "heart_rate" else f"{y}-{mo}-{d} {hm}"
        vals = []
        with open(f"/app/data/{fn}", newline="", encoding="utf-8-sig") as f:
            for row in csv.reader(f):
                ts = row[0].strip()
                if (ts == key) if metric == "heart_rate" else ts.startswith(key):
                    vals.append(float(row[1]))
        ok = len(vals) == p["count"] and abs(sum(vals) / len(vals) - p["mean"]) < 0.001 and min(vals) == p["min"] and max(vals) == p["max"]
        print(f"spot-check {metric} {p['ts']}: raw n={len(vals)} mean={sum(vals)/len(vals):.3f} min={min(vals)} max={max(vals)} | stored n={p['count']} mean={p['mean']} min={p['min']} max={p['max']} -> {'OK' if ok else 'MISMATCH'}")

d = requests.get(f"{API}/patients/001", headers=H).json()
for e in d["events"]:
    ev = requests.get(f"{API}/events/{e['id']}", headers=H).json()
    print("glucose event", e["start"], e["direction"], "review:", ev["review"]["status"], "| summary:", (ev["summary"] or {}).get("source"), (ev["summary"] or {}).get("generation_status"))
s = requests.get(f"{API}/patients/001/series", headers=H).json()
print("glucose readings", len(s["points"]), "gaps", len(s["gaps"]), "range", s["points"][0]["ts"], "->", s["points"][-1]["ts"])
