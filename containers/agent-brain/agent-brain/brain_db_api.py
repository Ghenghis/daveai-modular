"""brain_db_api.py — REST API routes for /db/* endpoints.
Provides session tracking, analytics, user profiles, chat messages,
projects, game data (players, hiscores, progress), dashboard stats.
Uses SQLite via brain_db.get_db().
"""
import json, os, subprocess
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from brain_db import get_db, log_event

router = APIRouter(prefix="/db", tags=["db-api"])

# ── Schema ────────────────────────────────────────────────────────────────────

def init_db_api_tables():
    """Create tables for the /db/* API. Safe to call multiple times."""
    db = get_db()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS dv_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        ip TEXT,
        user_agent TEXT,
        last_heartbeat TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dv_analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT,
        event_type TEXT NOT NULL,
        event_data TEXT DEFAULT '{}',
        ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dv_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT DEFAULT '',
        display_name TEXT DEFAULT '',
        role TEXT DEFAULT 'user',
        last_login TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dv_chat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        agent TEXT DEFAULT '',
        model TEXT DEFAULT '',
        ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dv_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        url TEXT DEFAULT '',
        category TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dv_game_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        player_name TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS dv_game_hiscores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        map_id TEXT DEFAULT '',
        map_name TEXT DEFAULT '',
        difficulty TEXT DEFAULT 'normal',
        waves_survived INTEGER DEFAULT 0,
        stars INTEGER DEFAULT 0,
        play_mode TEXT DEFAULT 'classic',
        time_seconds INTEGER DEFAULT 0,
        ts TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (player_id) REFERENCES dv_game_players(id)
    );
    CREATE TABLE IF NOT EXISTS dv_game_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        map_id TEXT NOT NULL,
        stars INTEGER DEFAULT 0,
        best_score INTEGER DEFAULT 0,
        best_wave INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(player_id, map_id),
        FOREIGN KEY (player_id) REFERENCES dv_game_players(id)
    );
    CREATE INDEX IF NOT EXISTS idx_dv_sess_hb ON dv_sessions(last_heartbeat DESC);
    CREATE INDEX IF NOT EXISTS idx_dv_ana_ts  ON dv_analytics_events(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_dv_chat_ts ON dv_chat(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_dv_hs_score ON dv_game_hiscores(score DESC);
    """)
    db.commit()
    db.close()


# ── Session Heartbeat ─────────────────────────────────────────────────────────

@router.post("/session/heartbeat")
async def session_heartbeat(body: dict, request: Request):
    sid = body.get("session_id", "")
    uid = body.get("user_id")
    if not sid:
        raise HTTPException(400, "session_id required")
    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")[:200]
    now = datetime.now().isoformat()
    db = get_db()
    existing = db.execute("SELECT id FROM dv_sessions WHERE id=?", (sid,)).fetchone()
    if existing:
        db.execute("UPDATE dv_sessions SET last_heartbeat=?, user_id=? WHERE id=?",
                   (now, uid, sid))
    else:
        db.execute("INSERT INTO dv_sessions (id, user_id, ip, user_agent, last_heartbeat) VALUES (?,?,?,?,?)",
                   (sid, uid, ip, ua, now))
    db.commit()
    db.close()
    return {"ok": True}


# ── Analytics Events ──────────────────────────────────────────────────────────

@router.post("/analytics")
async def track_event(body: dict):
    uid = body.get("user_id")
    sid = body.get("session_id", "")
    event_type = body.get("event_type", "unknown")
    event_data = json.dumps(body.get("event_data", {}))
    db = get_db()
    db.execute("INSERT INTO dv_analytics_events (user_id, session_id, event_type, event_data) VALUES (?,?,?,?)",
               (uid, sid, event_type, event_data))
    db.commit()
    db.close()
    return {"ok": True}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users/{username}")
async def get_user(username: str):
    db = get_db()
    row = db.execute("SELECT * FROM dv_users WHERE username=?", (username,)).fetchone()
    db.close()
    if not row:
        return None
    return dict(row)

@router.post("/users/{username}/login")
async def user_login_touch(username: str):
    db = get_db()
    db.execute("UPDATE dv_users SET last_login=datetime('now') WHERE username=?", (username,))
    db.commit()
    db.close()
    return {"ok": True}

@router.post("/users")
async def create_user(body: dict):
    username = body.get("username", "").strip()
    email = body.get("email", "")
    display_name = body.get("display_name", username)
    role = body.get("role", "user")
    if not username:
        raise HTTPException(400, "username required")
    db = get_db()
    try:
        db.execute("INSERT INTO dv_users (username, email, display_name, role) VALUES (?,?,?,?)",
                   (username, email, display_name, role))
        db.commit()
        uid = db.execute("SELECT id FROM dv_users WHERE username=?", (username,)).fetchone()["id"]
    except Exception:
        db.close()
        # Already exists — return existing
        row = db.execute("SELECT * FROM dv_users WHERE username=?", (username,)).fetchone()
        db.close()
        return dict(row) if row else {"error": "Failed to create user"}
    db.close()
    return {"id": uid, "username": username, "email": email, "display_name": display_name, "role": role}

@router.get("/users")
async def list_users():
    db = get_db()
    rows = db.execute("SELECT id, username, email, display_name, role, last_login, created_at FROM dv_users ORDER BY id").fetchall()
    db.close()
    return [dict(r) for r in rows]

@router.patch("/users/{user_id}")
async def update_user(user_id: int, body: dict):
    db = get_db()
    sets = []
    vals = []
    for k in ("display_name", "email"):
        if k in body:
            sets.append(f"{k}=?")
            vals.append(body[k])
    if not sets:
        db.close()
        return {"ok": True}
    vals.append(user_id)
    db.execute(f"UPDATE dv_users SET {','.join(sets)} WHERE id=?", vals)
    db.commit()
    db.close()
    return {"ok": True}


# ── Chat Messages ─────────────────────────────────────────────────────────────

@router.post("/chat")
async def save_chat(body: dict):
    uid = body.get("user_id")
    sid = body.get("session_id", "")
    role = body.get("role", "user")
    content = body.get("content", "")
    agent = body.get("agent", "")
    model = body.get("model", "")
    db = get_db()
    db.execute("INSERT INTO dv_chat (user_id, session_id, role, content, agent, model) VALUES (?,?,?,?,?,?)",
               (uid, sid, role, content[:10000], agent, model))
    db.commit()
    db.close()
    return {"ok": True}

@router.get("/chat/fallback")
async def chat_fallback():
    db = get_db()
    rows = db.execute("SELECT * FROM dv_chat ORDER BY ts DESC LIMIT 50").fetchall()
    db.close()
    return [dict(r) for r in rows]

@router.post("/chat/fallback")
async def chat_fallback_post(body: dict):
    return await save_chat(body)


# ── Projects ──────────────────────────────────────────────────────────────────

@router.post("/projects")
async def save_project(body: dict):
    uid = body.get("user_id")
    name = body.get("name", "")
    url = body.get("url", "")
    category = body.get("category", "")
    status = body.get("status", "active")
    if not name:
        raise HTTPException(400, "name required")
    db = get_db()
    db.execute("INSERT INTO dv_projects (user_id, name, url, category, status) VALUES (?,?,?,?,?)",
               (uid, name, url, category, status))
    db.commit()
    pid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.close()
    return {"id": pid, "name": name, "url": url, "category": category, "status": status}

@router.get("/projects")
async def list_projects():
    db = get_db()
    rows = db.execute("SELECT * FROM dv_projects ORDER BY created_at DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


# ── Game Players ──────────────────────────────────────────────────────────────

@router.get("/game/players/{player_name}")
async def get_player(player_name: str):
    db = get_db()
    row = db.execute("SELECT * FROM dv_game_players WHERE player_name=?", (player_name,)).fetchone()
    db.close()
    if not row:
        return None
    return dict(row)

@router.post("/game/players")
async def create_player(body: dict):
    uid = body.get("user_id")
    name = body.get("player_name", "").strip()
    if not name:
        raise HTTPException(400, "player_name required")
    db = get_db()
    try:
        db.execute("INSERT INTO dv_game_players (user_id, player_name) VALUES (?,?)", (uid, name))
        db.commit()
        pid = db.execute("SELECT id FROM dv_game_players WHERE player_name=?", (name,)).fetchone()["id"]
    except Exception:
        row = db.execute("SELECT * FROM dv_game_players WHERE player_name=?", (name,)).fetchone()
        db.close()
        return dict(row) if row else {"error": "Failed to create player"}
    db.close()
    return {"id": pid, "player_name": name, "user_id": uid}


# ── Game Hi-Scores ────────────────────────────────────────────────────────────

@router.get("/game/hiscores")
async def get_hiscores(limit: int = 20, map_id: str = ""):
    db = get_db()
    if map_id:
        rows = db.execute(
            "SELECT * FROM dv_game_hiscores WHERE map_id=? ORDER BY score DESC LIMIT ?",
            (map_id, limit)).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM dv_game_hiscores ORDER BY score DESC LIMIT ?",
            (limit,)).fetchall()
    db.close()
    return [dict(r) for r in rows]

@router.post("/game/hiscores")
async def save_hiscore(body: dict):
    pid = body.get("player_id")
    pname = body.get("player_name", "")
    score = body.get("score", 0)
    map_id = body.get("map_id", "")
    map_name = body.get("map_name", "")
    diff = body.get("difficulty", "normal")
    waves = body.get("waves_survived", 0)
    stars = body.get("stars", 0)
    mode = body.get("play_mode", "classic")
    time_s = body.get("time_seconds", 0)
    if not pid:
        raise HTTPException(400, "player_id required")
    db = get_db()
    db.execute(
        "INSERT INTO dv_game_hiscores (player_id, player_name, score, map_id, map_name, difficulty, waves_survived, stars, play_mode, time_seconds) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (pid, pname, score, map_id, map_name, diff, waves, stars, mode, time_s))
    db.commit()
    hid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.close()
    log_event("game_hiscore", f"{pname} score={score} map={map_id}")
    return {"id": hid, "score": score, "player_name": pname}


# ── Game Progress ─────────────────────────────────────────────────────────────

@router.post("/game/progress")
async def save_progress(body: dict):
    pid = body.get("player_id")
    map_id = body.get("map_id", "")
    stars = body.get("stars", 0)
    best_score = body.get("best_score", 0)
    best_wave = body.get("best_wave", 0)
    completed = 1 if body.get("completed") else 0
    if not pid or not map_id:
        raise HTTPException(400, "player_id and map_id required")
    db = get_db()
    existing = db.execute(
        "SELECT id, stars, best_score, best_wave FROM dv_game_progress WHERE player_id=? AND map_id=?",
        (pid, map_id)).fetchone()
    if existing:
        new_stars = max(existing["stars"], stars)
        new_score = max(existing["best_score"], best_score)
        new_wave = max(existing["best_wave"], best_wave)
        db.execute(
            "UPDATE dv_game_progress SET stars=?, best_score=?, best_wave=?, completed=?, updated_at=datetime('now') WHERE player_id=? AND map_id=?",
            (new_stars, new_score, new_wave, completed, pid, map_id))
    else:
        db.execute(
            "INSERT INTO dv_game_progress (player_id, map_id, stars, best_score, best_wave, completed) VALUES (?,?,?,?,?,?)",
            (pid, map_id, stars, best_score, best_wave, completed))
    db.commit()
    db.close()
    return {"ok": True}

@router.get("/game/progress/{player_id}")
async def get_progress(player_id: int):
    db = get_db()
    rows = db.execute("SELECT * FROM dv_game_progress WHERE player_id=? ORDER BY map_id", (player_id,)).fetchall()
    db.close()
    return [dict(r) for r in rows]


# ── Dashboard Stats ───────────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard():
    db = get_db()
    user_count = db.execute("SELECT COUNT(*) as c FROM dv_users").fetchone()["c"]
    chat_count = db.execute("SELECT COUNT(*) as c FROM dv_chat").fetchone()["c"]
    project_count = db.execute("SELECT COUNT(*) as c FROM dv_projects").fetchone()["c"]
    hiscore_count = db.execute("SELECT COUNT(*) as c FROM dv_game_hiscores").fetchone()["c"]
    analytics_count = db.execute("SELECT COUNT(*) as c FROM dv_analytics_events").fetchone()["c"]
    player_count = db.execute("SELECT COUNT(*) as c FROM dv_game_players").fetchone()["c"]
    # Active sessions in last 5 minutes
    active = db.execute(
        "SELECT COUNT(*) as c FROM dv_sessions WHERE last_heartbeat > datetime('now', '-5 minutes')").fetchone()["c"]
    # Recent analytics
    recent_events = db.execute(
        "SELECT event_type, COUNT(*) as c FROM dv_analytics_events WHERE ts > datetime('now', '-1 hour') GROUP BY event_type ORDER BY c DESC LIMIT 10").fetchall()
    db.close()
    return {
        "users": user_count, "chat_messages": chat_count, "projects": project_count,
        "hiscores": hiscore_count, "analytics_events": analytics_count,
        "game_players": player_count, "active_sessions": active,
        "recent_events": [dict(r) for r in recent_events],
    }


# ── VPS Stats ─────────────────────────────────────────────────────────────────

@router.get("/vps-stats")
async def vps_stats():
    """Return VPS resource stats in the nested structure the UI expects."""
    stats = {
        "cpu": {"percent": 0, "cores": 0},
        "memory": {"percent": 0, "used": 0, "total": 0},
        "disk": {"percent": 0, "used": 0, "total": 0},
        "os": "Linux", "kernel": "", "uptime": "unknown",
        "load": {"1m": "0", "5m": "0", "15m": "0"},
        "postgresql": "unknown", "services": []
    }
    def _run(cmd):
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
            return r.stdout.strip() if r.returncode == 0 else ""
        except Exception:
            return ""

    # OS info
    stats["os"] = _run("lsb_release -ds 2>/dev/null || cat /etc/os-release 2>/dev/null | head -1") or "Linux"
    stats["kernel"] = _run("uname -r")
    stats["uptime"] = _run("uptime -p") or "unknown"

    # Load average
    load_str = _run("cat /proc/loadavg 2>/dev/null")
    if load_str:
        parts = load_str.split()
        if len(parts) >= 3:
            stats["load"] = {"1m": parts[0], "5m": parts[1], "15m": parts[2]}

    # CPU
    cores = _run("nproc 2>/dev/null")
    stats["cpu"]["cores"] = int(cores) if cores.isdigit() else 0
    cpu_pct = _run("awk '{u=$2+$4; t=$2+$4+$5; if(t>0) printf \"%.1f\", 100*u/t}' /proc/stat 2>/dev/null | head -1")
    stats["cpu"]["percent"] = float(cpu_pct) if cpu_pct else 0

    # Memory (bytes for UI _fmtBytes)
    mem_str = _run("free -b | awk 'NR==2{printf \"%d %d\", $3, $2}'")
    if mem_str:
        parts = mem_str.split()
        if len(parts) == 2:
            used, total = int(parts[0]), int(parts[1])
            stats["memory"] = {
                "percent": round(100 * used / total, 1) if total else 0,
                "used": used, "total": total
            }

    # Disk (bytes for UI _fmtBytes)
    disk_str = _run("df -B1 / | awk 'NR==2{printf \"%d %d %s\", $3, $2, $5}'")
    if disk_str:
        parts = disk_str.split()
        if len(parts) >= 3:
            used, total = int(parts[0]), int(parts[1])
            pct_str = parts[2].replace("%", "")
            stats["disk"] = {
                "percent": float(pct_str) if pct_str else 0,
                "used": used, "total": total
            }

    # PostgreSQL status
    pg = _run("systemctl is-active postgresql 2>/dev/null")
    stats["postgresql"] = pg if pg else "unknown"

    # PM2 services
    pm2_json = _run("pm2 jlist 2>/dev/null")
    if pm2_json:
        try:
            import json as _json
            svcs = _json.loads(pm2_json)
            stats["services"] = [
                {"name": s.get("name", "?"), "status": s.get("pm2_env", {}).get("status", "?"),
                 "cpu": s.get("monit", {}).get("cpu", 0),
                 "memory": s.get("monit", {}).get("memory", 0),
                 "uptime": s.get("pm2_env", {}).get("pm_uptime", 0)}
                for s in svcs
            ]
        except Exception:
            pass

    return stats


# ── Active Sessions ───────────────────────────────────────────────────────────

@router.get("/sessions/active")
async def active_sessions():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM dv_sessions WHERE last_heartbeat > datetime('now', '-5 minutes') ORDER BY last_heartbeat DESC"
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


# ── Logs ──────────────────────────────────────────────────────────────────────

@router.get("/logs/{service}")
async def get_logs(service: str):
    """Get recent PM2 logs for a service."""
    allowed = {"agent-brain", "litellm", "edge-tts", "agentic-ui", "watchdog", "self-improve"}
    if service not in allowed:
        raise HTTPException(400, f"Unknown service: {service}")
    try:
        r = subprocess.run(
            f"pm2 logs {service} --nostream --lines 50 2>&1",
            shell=True, capture_output=True, text=True, timeout=10)
        lines = r.stdout.strip().splitlines()[-50:]
        return {"service": service, "entries": lines}
    except Exception as e:
        return {"service": service, "entries": [], "error": str(e)}


# ── Raw Query (admin only — guarded at route level) ──────────────────────────

@router.post("/query")
async def raw_query(body: dict):
    sql = body.get("sql", "").strip()
    if not sql:
        raise HTTPException(400, "sql required")
    # Safety: only allow SELECT
    if not sql.upper().startswith("SELECT"):
        raise HTTPException(403, "Only SELECT queries allowed")
    db = get_db()
    try:
        rows = db.execute(sql).fetchall()
        db.close()
        return {"rows": [dict(r) for r in rows], "count": len(rows)}
    except Exception as e:
        db.close()
        return {"error": str(e), "rows": [], "count": 0}
