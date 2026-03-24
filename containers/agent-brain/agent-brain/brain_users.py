"""brain_users.py — Multi-user auth system with role-based access.
Admin (fnice1971@gmail.com) = full site control.
Normal users = own projects only.
Passwords stored as SHA-256 hashes.
"""
import hashlib, os, threading
from datetime import datetime, timedelta
from typing import Optional

try:
    import jwt as _jwt
    _JWT_OK = True
except ImportError:
    _JWT_OK = False

from brain_core import DB_PATH, JWT_SECRET
from brain_db import get_db, log_event

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "fnice1971@gmail.com")
DEFAULT_ADMIN_PW = "Dal!0107Dal!0107"

# ── Schema ────────────────────────────────────────────────────────

def init_users_table():
    """Create users table and seed admin account."""
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    # Seed admin from admin_table if exists, else use default
    if not db.execute("SELECT id FROM users WHERE email=?", (ADMIN_EMAIL,)).fetchone():
        try:
            row = db.execute("SELECT password_hash FROM admin_table WHERE id=1").fetchone()
            admin_hash = row["password_hash"] if row else _hash(DEFAULT_ADMIN_PW)
        except Exception:
            admin_hash = _hash(DEFAULT_ADMIN_PW)
        db.execute(
            "INSERT INTO users (email, password_hash, display_name, role) VALUES (?,?,?,?)",
            (ADMIN_EMAIL, admin_hash, "DaveAI", "admin"))
        log_event("user_seed", f"admin={ADMIN_EMAIL}")
    db.commit()
    db.close()


# ── Helpers ───────────────────────────────────────────────────────

def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def _make_token(user_id: int, email: str, role: str, display_name: str, hours: int = 24) -> str:
    if not _JWT_OK:
        return "no-jwt-lib"
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "name": display_name,
        "exp": datetime.utcnow() + timedelta(hours=hours),
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _decode_token(token: str) -> Optional[dict]:
    if not _JWT_OK:
        return None
    try:
        return _jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None


def _get_user_by_email(email: str) -> Optional[dict]:
    db = get_db()
    row = db.execute(
        "SELECT id, email, password_hash, display_name, role, created_at FROM users WHERE email=?",
        (email.strip().lower(),)).fetchone()
    db.close()
    return dict(row) if row else None


def _get_user_by_id(uid: int) -> Optional[dict]:
    db = get_db()
    row = db.execute(
        "SELECT id, email, password_hash, display_name, role, created_at FROM users WHERE id=?",
        (uid,)).fetchone()
    db.close()
    return dict(row) if row else None


# ── Public API ────────────────────────────────────────────────────

def user_register(email: str, password: str, display_name: str = "") -> dict:
    """Register a new user. Returns {token, email, role, display_name} or {error}."""
    email = email.strip().lower()
    if not email or "@" not in email:
        return {"error": "Invalid email address"}
    if len(password) < 8:
        return {"error": "Password must be at least 8 characters"}
    if not display_name:
        display_name = email.split("@")[0].title()

    existing = _get_user_by_email(email)
    if existing:
        return {"error": "Email already registered"}

    pw_hash = _hash(password)
    role = "admin" if email == ADMIN_EMAIL else "user"

    db = get_db()
    db.execute(
        "INSERT INTO users (email, password_hash, display_name, role) VALUES (?,?,?,?)",
        (email, pw_hash, display_name, role))
    db.commit()
    uid = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
    db.close()

    log_event("user_register", email)
    token = _make_token(uid, email, role, display_name)
    return {"token": token, "email": email, "role": role, "display_name": display_name, "user_id": uid}


def user_login(email: str, password: str) -> dict:
    """Login. Returns {token, email, role, display_name} or {error}."""
    email = email.strip().lower()
    user = _get_user_by_email(email)
    if not user:
        return {"error": "Invalid email or password"}
    if user["password_hash"] != _hash(password):
        log_event("user_login_fail", email)
        return {"error": "Invalid email or password"}
    log_event("user_login", f"{email} role={user['role']}")
    token = _make_token(user["id"], email, user["role"], user["display_name"])
    return {
        "token": token, "email": email, "role": user["role"],
        "display_name": user["display_name"], "user_id": user["id"]
    }


def user_change_password(user_id: int, old_password: str, new_password: str) -> dict:
    """Self-service password change."""
    user = _get_user_by_id(user_id)
    if not user:
        return {"error": "User not found"}
    if user["password_hash"] != _hash(old_password):
        return {"error": "Current password is incorrect"}
    if len(new_password) < 8:
        return {"error": "New password must be at least 8 characters"}
    db = get_db()
    db.execute("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?",
               (_hash(new_password), user_id))
    db.commit()
    db.close()
    log_event("user_pw_change", f"uid={user_id}")
    return {"ok": True}


def get_user_from_token(token: str) -> Optional[dict]:
    """Decode JWT and return user info. Returns None if invalid."""
    payload = _decode_token(token)
    if not payload:
        return None
    return {
        "user_id": int(payload.get("sub", 0)),
        "email": payload.get("email", ""),
        "role": payload.get("role", "user"),
        "display_name": payload.get("name", ""),
    }


# ── Admin-only ────────────────────────────────────────────────────

def admin_list_users() -> list:
    """List all users (admin only). No password hashes returned."""
    db = get_db()
    rows = db.execute(
        "SELECT id, email, display_name, role, created_at, updated_at FROM users ORDER BY id").fetchall()
    db.close()
    return [dict(r) for r in rows]


def admin_create_user(email: str, password: str, display_name: str = "", role: str = "user") -> dict:
    """Admin creates a user/admin account."""
    if role not in ("admin", "user"):
        return {"error": "Role must be 'admin' or 'user'"}
    email = email.strip().lower()
    if not email or "@" not in email:
        return {"error": "Invalid email"}
    if len(password) < 8:
        return {"error": "Password must be at least 8 characters"}
    if not display_name:
        display_name = email.split("@")[0].title()

    existing = _get_user_by_email(email)
    if existing:
        return {"error": "Email already registered"}

    db = get_db()
    db.execute(
        "INSERT INTO users (email, password_hash, display_name, role) VALUES (?,?,?,?)",
        (email, _hash(password), display_name, role))
    db.commit()
    uid = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
    db.close()
    log_event("admin_create_user", f"{email} role={role}")
    return {"ok": True, "user_id": uid, "email": email, "role": role, "display_name": display_name}


def admin_reset_password(target_user_id: int, new_password: str) -> dict:
    """Admin resets any user's password."""
    if len(new_password) < 8:
        return {"error": "Password must be at least 8 characters"}
    user = _get_user_by_id(target_user_id)
    if not user:
        return {"error": "User not found"}
    db = get_db()
    db.execute("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?",
               (_hash(new_password), target_user_id))
    db.commit()
    db.close()
    log_event("admin_pw_reset", f"uid={target_user_id} email={user['email']}")
    return {"ok": True, "email": user["email"]}


def admin_change_role(target_user_id: int, new_role: str) -> dict:
    """Admin promotes/demotes a user."""
    if new_role not in ("admin", "user"):
        return {"error": "Role must be 'admin' or 'user'"}
    user = _get_user_by_id(target_user_id)
    if not user:
        return {"error": "User not found"}
    db = get_db()
    db.execute("UPDATE users SET role=?, updated_at=datetime('now') WHERE id=?",
               (new_role, target_user_id))
    db.commit()
    db.close()
    log_event("admin_role_change", f"uid={target_user_id} {user['role']}->{new_role}")
    return {"ok": True, "email": user["email"], "role": new_role}


def admin_delete_user(target_user_id: int, admin_user_id: int) -> dict:
    """Admin deletes a user. Cannot delete self."""
    if target_user_id == admin_user_id:
        return {"error": "Cannot delete your own account"}
    user = _get_user_by_id(target_user_id)
    if not user:
        return {"error": "User not found"}
    if user["email"] == ADMIN_EMAIL:
        return {"error": "Cannot delete the primary admin account"}
    db = get_db()
    db.execute("DELETE FROM users WHERE id=?", (target_user_id,))
    db.commit()
    db.close()
    log_event("admin_delete_user", f"uid={target_user_id} email={user['email']}")
    return {"ok": True, "email": user["email"]}
