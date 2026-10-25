"""API check of the EEG upload onboarding flow (A01). Uses the existing clinician test user; writes only to the uploads dir."""
import sys
import time

import requests

sys.path.insert(0, "/app/backend/tests")
import clerk_helper as c  # noqa: E402

BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0] + "/api"
RAW = "/app/data/bci_iv_2a"
CHUNK = 4 * 1024 * 1024


def h():
    return {"Authorization": f"Bearer {c.token_for(c.CLINICIAN_ID)}"}


def upload(job, role, path):
    data = open(path, "rb").read()
    total = (len(data) + CHUNK - 1) // CHUNK
    for i in range(total):
        r = requests.put(f"{BASE}/research/uploads/{job}/files/{role}", params={"index": i, "total": total, "filename": path.split("/")[-1]},
                         data=data[i * CHUNK:(i + 1) * CHUNK], headers={**h(), "Content-Type": "application/octet-stream"}, timeout=120)
        r.raise_for_status()


def run(cal, ev, pid="A01"):
    t0 = time.time()
    job = requests.post(f"{BASE}/research/uploads", json={"participant": pid}, headers=h()).json()["id"]
    upload(job, "calibration", cal)
    upload(job, "evaluation", ev)
    t_up = time.time() - t0
    r = requests.post(f"{BASE}/research/uploads/{job}/process", headers=h())
    assert r.status_code == 202, r.text
    while True:
        s = requests.get(f"{BASE}/research/uploads/{job}", headers=h()).json()
        if s["state"] in ("done", "failed"):
            return job, s, t_up, time.time() - t0
        time.sleep(0.5)


job, s, t_up, t_all = run(f"{RAW}/A01T.mat", f"{RAW}/A01E.mat")
print("A01:", s["state"], "upload_s", round(t_up, 1), "server_s", s.get("total_seconds"), "end_to_end_s", round(t_all, 1))
print(" stages", [(x["key"], x["seconds"]) for x in s["stages"]])
print(" check", s["result"]["benchmark_check"]["pass"], "A", s["result"]["A_no_alignment"]["accuracy"], "B", s["result"]["B_recentered"]["accuracy"],
      "pp", round(s["result"]["delta_accuracy_pp"], 2), "precomputed_target", s["precomputed_target_artifacts_used"])
job2, s2, _, _ = run(f"{RAW}/A01E.mat", f"{RAW}/A01T.mat")
print("swapped files:", s2["state"], "|", s2.get("error"))
r = requests.post(f"{BASE}/research/uploads", json={"participant": "A02"}, headers=h()).json()
print("missing files:", requests.post(f"{BASE}/research/uploads/{r['id']}/process", headers=h()).json())
print("no auth:", requests.post(f"{BASE}/research/uploads", json={"participant": "A01"}).status_code)
