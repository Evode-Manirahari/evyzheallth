"""Overlap/conflict check with SYNTHETIC files (TEST participant SYN-CF). Cleans up after itself."""
import json
import os
import urllib.request
from pathlib import Path

import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0] + "/api"
DATA = Path(os.environ["SERVER_DATA_DIR"])


def clerk(p, body):
    req = urllib.request.Request("https://api.clerk.com/v1" + p, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "t"})
    return json.load(urllib.request.urlopen(req))


uid = "user_3LA20sZnJyrR2GiMtpaUYrdo6AH"
H = {"Authorization": "Bearer " + clerk(f"/sessions/{clerk('/sessions', {'user_id': uid})['id']}/tokens", {"expires_in_seconds": 600})["jwt"]}
a = "datetime, hr\n" + "".join(f"1/1/30 10:0{m},{v}\n" for m in range(3) for v in (70, 72))
b = "datetime, hr\n" + "".join(f"1/1/30 10:0{m},{v}\n" for m in range(5) for v in ((70, 72) if m != 2 else (90, 92)))
(DATA / "HR_SYN-CF.csv").write_text(a)
(DATA / "HR_SYN-CF-B.csv").write_text(b)
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
try:
    db.patients.insert_one({"id": "SYN-CF", "data_label": "Synthetic test fixture"})
    for fn in ("HR_SYN-CF.csv", "HR_SYN-CF-B.csv", "HR_SYN-CF-B.csv"):
        r = requests.post(f"{API}/server-files/import", headers=H, json={"filename": fn, "participant_id": "SYN-CF"}).json()
        print(fn, {k: r.get(k) for k in ("aggregates", "inserted", "identical_skipped", "conflicts_flagged", "note")})
    c = requests.get(f"{API}/patients/SYN-CF/context/heart_rate", headers=H).json()
    print("stored", [(p["ts"][11:16], p["mean"], p["count"]) for p in c["points"]], "conflicts", c["conflicts_count"], c["conflicts"][:1])
finally:
    db.patients.delete_many({"id": "SYN-CF"})
    for coll in ("measurement_aggregates", "aggregate_conflicts", "imports"):
        db[coll].delete_many({"patient_id": "SYN-CF"})
    for fn in ("HR_SYN-CF.csv", "HR_SYN-CF-B.csv"):
        (DATA / fn).unlink(missing_ok=True)
    print("cleaned")
