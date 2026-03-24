"""brain_checkpoint.py — SQLite-backed checkpoint/resume for agent invocations.

Every LangGraph node transition saves a checkpoint so a crash mid-build
can be resumed without losing work.

Usage:
    from brain_checkpoint import checkpoint_save, checkpoint_load, checkpoint_expire

Triple failsafe:
    1. SQLite checkpoint (this module) — survives process restart
    2. Git HEAD hash in checkpoint — can restore workspace state
    3. Graceful no-op on DB error — never blocks the agent pipeline
"""

import json, sqlite3, time, os
from pathlib import Path
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────────────
_DB_PATH   = os.getenv("BRAIN_DB", "/opt/agent-brain/daveai.db")
_MAX_KEEP  = 5      # Keep last N checkpoints per site
_TTL_HOURS = 24     # Expire checkpoints older than N hours


# ── Schema bootstrap ───────────────────────────────────────────────────────────
def _ensure_table():
    """Create checkpoints table if absent — idempotent."""
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            con.execute("""
                CREATE TABLE IF NOT EXISTS checkpoints (
                    id          TEXT PRIMARY KEY,
                    session_id  TEXT NOT NULL,
                    site_name   TEXT NOT NULL DEFAULT 'main',
                    step_name   TEXT NOT NULL,
                    request     TEXT,
                    plan_json   TEXT,
                    tasks_json  TEXT,
                    results_json TEXT,
                    git_hash    TEXT,
                    tokens_used INTEGER DEFAULT 0,
                    files_written INTEGER DEFAULT 0,
                    status      TEXT DEFAULT 'active',
                    created_at  REAL NOT NULL
                )
            """)
            con.execute("CREATE INDEX IF NOT EXISTS idx_cp_session ON checkpoints(session_id)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_cp_site ON checkpoints(site_name, created_at)")
            con.commit()
    except Exception:
        pass  # Failsafe 3: DB error never blocks agent


_ensure_table()


# ── Public API ─────────────────────────────────────────────────────────────────
def checkpoint_save(
    session_id: str,
    step_name:  str,
    request:    str,
    plan:       dict,
    tasks:      list,
    results:    list,
    site_name:  str = "main",
    tokens_used: int = 0,
    files_written: int = 0,
) -> str:
    """Save a checkpoint. Returns checkpoint id, or '' on error."""
    cp_id = f"{session_id}_{step_name}_{int(time.time())}"
    git_hash = _git_hash()
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            con.execute("""
                INSERT INTO checkpoints
                    (id, session_id, site_name, step_name, request,
                     plan_json, tasks_json, results_json, git_hash,
                     tokens_used, files_written, status, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?)
            """, (
                cp_id, session_id, site_name, step_name, request[:500],
                json.dumps(plan), json.dumps(tasks), json.dumps(results),
                git_hash, tokens_used, files_written, time.time()
            ))
            con.commit()
        _prune(site_name)
        return cp_id
    except Exception:
        return ""  # Failsafe 3


def checkpoint_load(session_id: str) -> Optional[dict]:
    """Load the most recent active checkpoint for a session. Returns None if none."""
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            row = con.execute("""
                SELECT id, step_name, request, plan_json, tasks_json,
                       results_json, git_hash, tokens_used, files_written
                FROM   checkpoints
                WHERE  session_id = ? AND status = 'active'
                ORDER  BY created_at DESC LIMIT 1
            """, (session_id,)).fetchone()
        if not row:
            return None
        return {
            "id":           row[0],
            "step_name":    row[1],
            "request":      row[2],
            "plan":         json.loads(row[3] or "{}"),
            "tasks":        json.loads(row[4] or "[]"),
            "results":      json.loads(row[5] or "[]"),
            "git_hash":     row[6],
            "tokens_used":  row[7],
            "files_written": row[8],
        }
    except Exception:
        return None  # Failsafe 3


def checkpoint_latest_for_site(site_name: str = "main") -> Optional[dict]:
    """Load most recent active checkpoint for a site (cross-session)."""
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            row = con.execute("""
                SELECT id, session_id, step_name, request, plan_json,
                       tasks_json, results_json, git_hash, created_at
                FROM   checkpoints
                WHERE  site_name = ? AND status = 'active'
                  AND  created_at > ?
                ORDER  BY created_at DESC LIMIT 1
            """, (site_name, time.time() - _TTL_HOURS * 3600)).fetchone()
        if not row:
            return None
        return {
            "id":         row[0],
            "session_id": row[1],
            "step_name":  row[2],
            "request":    row[3],
            "plan":       json.loads(row[4] or "{}"),
            "tasks":      json.loads(row[5] or "[]"),
            "results":    json.loads(row[6] or "[]"),
            "git_hash":   row[7],
            "age_minutes": round((time.time() - row[8]) / 60, 1),
        }
    except Exception:
        return None


def checkpoint_complete(cp_id: str):
    """Mark a checkpoint as completed (build finished successfully)."""
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            con.execute(
                "UPDATE checkpoints SET status='complete' WHERE id=?", (cp_id,))
            con.commit()
    except Exception:
        pass


def checkpoint_fail(cp_id: str):
    """Mark a checkpoint as failed."""
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            con.execute(
                "UPDATE checkpoints SET status='failed' WHERE id=?", (cp_id,))
            con.commit()
    except Exception:
        pass


def checkpoint_expire():
    """Delete checkpoints older than TTL_HOURS. Call from maintenance cron."""
    try:
        cutoff = time.time() - _TTL_HOURS * 3600
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            n = con.execute(
                "DELETE FROM checkpoints WHERE created_at < ?", (cutoff,)
            ).rowcount
            con.commit()
        return n
    except Exception:
        return 0


def checkpoint_list(site_name: str = "main", limit: int = 10) -> list:
    """List recent checkpoints for a site (for UI display)."""
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            rows = con.execute("""
                SELECT id, session_id, step_name, request, status,
                       created_at, tokens_used
                FROM   checkpoints
                WHERE  site_name = ?
                ORDER  BY created_at DESC LIMIT ?
            """, (site_name, limit)).fetchall()
        return [
            {"id": r[0], "session_id": r[1], "step": r[2],
             "request": r[3][:80], "status": r[4],
             "age_minutes": round((time.time() - r[5]) / 60, 1),
             "tokens": r[6]}
            for r in rows
        ]
    except Exception:
        return []


# ── Helpers ────────────────────────────────────────────────────────────────────
def _git_hash() -> str:
    """Return current git HEAD short hash, or empty string on failure."""
    try:
        import subprocess as sp
        r = sp.run(["git", "-C", os.getenv("WORKSPACE", "/var/www/agentic-website"),
                    "rev-parse", "--short", "HEAD"],
                   capture_output=True, text=True, timeout=5)
        return r.stdout.strip()
    except Exception:
        return ""


def _prune(site_name: str):
    """Keep only the last _MAX_KEEP checkpoints per site."""
    try:
        with sqlite3.connect(_DB_PATH, timeout=10) as con:
            con.execute("PRAGMA journal_mode=WAL")
            ids = con.execute("""
                SELECT id FROM checkpoints WHERE site_name = ?
                ORDER BY created_at DESC LIMIT -1 OFFSET ?
            """, (site_name, _MAX_KEEP)).fetchall()
            if ids:
                placeholders = ",".join("?" * len(ids))
                con.execute(
                    f"DELETE FROM checkpoints WHERE id IN ({placeholders})",
                    [r[0] for r in ids])
                con.commit()
    except Exception:
        pass
