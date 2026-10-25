# Measures AI brief valid vs fallback rate on synthetic fixture (manual script)
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
from test_evyz_backend import api, preview, mdb
N = int(sys.argv[1]) if len(sys.argv) > 1 else 4
d = preview().json()
api("POST", f"/imports/{d['import_id']}/commit", json={"participant_id": "900"})
eid = api("GET", "/patients/900").json()["events"][0]["id"]
print("eid", eid)
for i in range(N):
    mdb.summaries.delete_many({"event_id": eid})
    t = time.time()
    r = api("POST", f"/events/{eid}/brief").json()
    print(i, r["source"], r["generation_status"], r["validation_errors"], round(time.time() - t, 1))
