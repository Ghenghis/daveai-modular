"""brain_auth.py — JWT auth, admin management, key vault, token-bucket rate limiting."""
import hashlib, json, os, time, threading
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from brain_core import JWT_SECRET, VAULT_PATH, GITLAB_URL, ADMIN_EMAIL
from brain_db import get_db, log_event

try:
    import jwt
    _JWT_OK = True
except ImportError:
    _JWT_OK = False

security = HTTPBearer(auto_error=False)

# ── JWT ────────────────────────────────────────────────────────────────────────
def make_token(hours: int = 24) -> str:
    if not _JWT_OK:
        return "no-jwt-lib"
    payload = {"sub": "admin", "exp": datetime.utcnow() + timedelta(hours=hours)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> bool:
    if not _JWT_OK:
        return True
    try:
        jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return True
    except Exception:
        return False


def is_admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> bool:
    if not creds:
        return False
    return verify_token(creds.credentials)


def require_admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> bool:
    if not is_admin(creds):
        raise HTTPException(status_code=403, detail="Admin token required")
    return True


# ── Admin login ────────────────────────────────────────────────────────────────
def admin_login(password: str) -> dict:
    db = get_db()
    row = db.execute(
        "SELECT password_hash,email FROM admin_table WHERE id=1").fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=401, detail="No admin configured")
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    if pw_hash != row["password_hash"]:
        log_event("admin_login_fail", "bad password")
        raise HTTPException(status_code=401, detail="Invalid password")
    log_event("admin_login", "ok")
    return {"token": make_token(), "email": row["email"]}


def admin_change_password(new_pw: str):
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password too short (min 8)")
    db = get_db()
    db.execute("UPDATE admin_table SET password_hash=? WHERE id=1",
               (hashlib.sha256(new_pw.encode()).hexdigest(),))
    db.commit(); db.close()


# ── Key vault ──────────────────────────────────────────────────────────────────
def vault_read() -> dict:
    try:
        with open(VAULT_PATH) as f:
            return json.load(f)
    except Exception:
        return {}

def vault_write(data: dict):
    with open(VAULT_PATH, "w") as f:
        json.dump(data, f, indent=2)

def vault_init():
    if not os.path.exists(VAULT_PATH):
        vault_write({
            "openrouter_key": "", "gitlab_token": "",
            "gitlab_url": GITLAB_URL, "huggingface_token": "",
            "anthropic_key": "", "notes": ""
        })

vault_init()


def vault_masked() -> dict:
    v = vault_read()
    return {k: ("*" * 8 if v.get(k) else "") if k != "notes" else v.get(k, "")
            for k in v}


# ── Token-bucket rate limiter (per IP, in-memory) ─────────────────────────────
_buckets: dict = {}
_bucket_lock = threading.Lock()
RATE_LIMIT_RPS = 10        # requests per second per IP
RATE_LIMIT_BURST = 20      # burst capacity


def check_rate_limit(client_ip: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    now = time.monotonic()
    with _bucket_lock:
        if client_ip not in _buckets:
            _buckets[client_ip] = {"tokens": RATE_LIMIT_BURST, "ts": now}
        b = _buckets[client_ip]
        elapsed = now - b["ts"]
        b["tokens"] = min(RATE_LIMIT_BURST, b["tokens"] + elapsed * RATE_LIMIT_RPS)
        b["ts"] = now
        if b["tokens"] >= 1:
            b["tokens"] -= 1
            return True
        return False
