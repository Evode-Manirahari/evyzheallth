# Helper: mint Clerk session JWTs for test users via Clerk Backend API (secret loaded, never printed)
import os
import secrets
import requests
from dotenv import dotenv_values

_SK = dotenv_values("/app/backend/.env").get("CLERK_SECRET_KEY")
H = {"Authorization": f"Bearer {_SK}", "User-Agent": "evyz-tests", "Content-Type": "application/json"}
API = "https://api.clerk.com/v1"
CLINICIAN_ID = "user_3LA20sZnJyrR2GiMtpaUYrdo6AH"
PENDING_EMAIL = "evyz.pending+clerk_test@example.com"
_sessions = {}


def find_or_create_user(email, password=None):
    password = password or secrets.token_urlsafe(16) + "!aA1"
    r = requests.get(f"{API}/users", headers=H, params={"email_address": email}, timeout=15)
    r.raise_for_status()
    if r.json():
        return r.json()[0]["id"]
    r = requests.post(f"{API}/users", headers=H, json={"email_address": [email], "password": password, "skip_password_checks": True}, timeout=15)
    r.raise_for_status()
    return r.json()["id"]


_jwts = {}


def token_for(user_id):
    import time
    c = _jwts.get(user_id)
    if c and time.time() - c[1] < 45:
        return c[0]
    t = _mint(user_id)
    _jwts[user_id] = (t, time.time())
    return t


def _mint(user_id):
    sid = _sessions.get(user_id)
    if sid:
        r = requests.post(f"{API}/sessions/{sid}/tokens", headers=H, timeout=15)
        if r.status_code == 200:
            return r.json()["jwt"]
    r = requests.post(f"{API}/sessions", headers=H, json={"user_id": user_id}, timeout=15)
    r.raise_for_status()
    sid = r.json()["id"]
    _sessions[user_id] = sid
    r = requests.post(f"{API}/sessions/{sid}/tokens", headers=H, timeout=15)
    r.raise_for_status()
    return r.json()["jwt"]


def sign_in_ticket(user_id):
    r = requests.post(f"{API}/sign_in_tokens", headers=H, json={"user_id": user_id, "expires_in_seconds": 600}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]
