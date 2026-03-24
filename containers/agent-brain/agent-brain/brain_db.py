"""brain_db.py — full DB layer: schema, CRUD for pages/analytics/memory/builds."""
import sqlite3, hashlib, uuid, json
from datetime import datetime
from brain_core import DB_PATH, ADMIN_EMAIL


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    _ensure_schema(db)
    return db


def _ensure_schema(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY, site TEXT DEFAULT 'main', name TEXT NOT NULL,
        path TEXT, template TEXT DEFAULT 'blank', content TEXT DEFAULT '',
        created_at TEXT, updated_at TEXT, created_by TEXT DEFAULT 'user');
    CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL, detail TEXT, ts TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_table (
        id INTEGER PRIMARY KEY, password_hash TEXT NOT NULL, email TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS build_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request TEXT, plan TEXT, results TEXT, commit_sha TEXT,
        duration_s REAL, status TEXT DEFAULT 'ok', ts TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
        ts TEXT NOT NULL, UNIQUE(agent,key));
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, messages TEXT DEFAULT '[]',
        created_at TEXT, updated_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_ana_ts  ON analytics(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_bld_ts  ON build_logs(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_mem_ag  ON agent_memory(agent, key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_site_path ON pages(site, path);
    """)
    db.commit()
    if not db.execute("SELECT id FROM admin_table").fetchone():
        pw = hashlib.sha256("DaveAI2026!".encode()).hexdigest()
        db.execute("INSERT INTO admin_table VALUES (1,?,?)", (pw, ADMIN_EMAIL))
        db.commit()


# ── Analytics ──────────────────────────────────────────────────────────────────
def log_event(event: str, detail: str = ""):
    try:
        db = get_db()
        db.execute("INSERT INTO analytics (event,detail,ts) VALUES (?,?,?)",
                   (event, detail[:500], datetime.now().isoformat()))
        db.commit(); db.close()
    except Exception: pass


# ── Build logs ─────────────────────────────────────────────────────────────────
def log_build(request: str, plan: str, results: list,
              commit_sha: str, duration_s: float, status: str = "ok"):
    try:
        db = get_db()
        db.execute(
            "INSERT INTO build_logs (request,plan,results,commit_sha,duration_s,status,ts) "
            "VALUES (?,?,?,?,?,?,?)",
            (request[:500], plan[:2000], json.dumps(results[:10]),
             commit_sha, round(duration_s, 2), status, datetime.now().isoformat()))
        db.commit(); db.close()
    except Exception: pass


def recent_builds(n: int = 5) -> list:
    db = get_db()
    rows = db.execute(
        "SELECT id,request,plan,commit_sha,duration_s,status,ts "
        "FROM build_logs ORDER BY ts DESC LIMIT ?", (n,)).fetchall()
    db.close()
    result = []
    for r in rows:
        plan_str = r["plan"] or ""
        agent = "coder"
        if "asset" in plan_str.lower():    agent = "asset"
        elif "qa" in plan_str.lower():     agent = "qa"
        elif "supervisor" in plan_str.lower(): agent = "supervisor"
        result.append({
            "id":      r["id"],
            "agent":   agent,
            "task":    (r["request"] or "")[:80],
            "outcome": r["status"] or "ok",
            "commit":  r["commit_sha"] or "",
            "duration_s": r["duration_s"] or 0,
            "ts":      r["ts"],
        })
    return result


# ── Pages CRUD ─────────────────────────────────────────────────────────────────
def pages_list(site: str = "main") -> list:
    db = get_db()
    rows = db.execute(
        "SELECT * FROM pages WHERE site=? ORDER BY created_at DESC", (site,)).fetchall()
    db.close()
    return [dict(r) for r in rows]


def page_create(name: str, site: str = "main", path: str = None, template: str = "blank", created_by: str = "user") -> dict:
    pid = str(uuid.uuid4())[:8]
    slug = name.lower().replace(" ", "-").replace("_", "-")
    page_path = path if path else f"/pages/{slug}"
    now = datetime.now().isoformat()
    db = get_db()
    # Dedup: if a row with this (site, path) already exists, return it — no duplicate insert
    existing = db.execute("SELECT * FROM pages WHERE site=? AND path=?", (site, page_path)).fetchone()
    if existing:
        db.close()
        return dict(existing)
    db.execute(
        "INSERT OR IGNORE INTO pages (id, site, name, path, template, content, created_at, updated_at, created_by) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (pid, site, name, page_path, template, "", now, now, created_by))
    db.commit()
    row = db.execute("SELECT * FROM pages WHERE site=? AND path=?", (site, page_path)).fetchone()
    db.close()
    if row is None:
        raise RuntimeError(f"page_create: row not found after commit for path {page_path!r}")
    return dict(row)


def page_update(page_id: str, name: str = None, content: str = None):
    updates, params = [], []
    if name is not None: updates.append("name=?"); params.append(name)
    if content is not None: updates.append("content=?"); params.append(content)
    updates.append("updated_at=?"); params.append(datetime.now().isoformat())
    params.append(page_id)
    db = get_db()
    db.execute(f"UPDATE pages SET {','.join(updates)} WHERE id=?", params)
    db.commit(); db.close()


def page_delete(page_id: str):
    db = get_db()
    db.execute("DELETE FROM pages WHERE id=?", (page_id,))
    db.commit(); db.close()


# ── Agent memory ───────────────────────────────────────────────────────────────
def mem_set(agent: str, key: str, value: str):
    db = get_db()
    db.execute(
        "INSERT INTO agent_memory (agent,key,value,ts) VALUES (?,?,?,?) "
        "ON CONFLICT(agent,key) DO UPDATE SET value=excluded.value,ts=excluded.ts",
        (agent, key, value[:2000], datetime.now().isoformat()))
    db.commit(); db.close()


def mem_get(agent: str, key: str) -> str:
    db = get_db()
    row = db.execute(
        "SELECT value FROM agent_memory WHERE agent=? AND key=?",
        (agent, key)).fetchone()
    db.close()
    return row["value"] if row else ""


def mem_search(agent: str, query: str, limit: int = 5) -> list[dict]:
    words = query.lower().split()
    db = get_db()
    rows = db.execute(
        "SELECT key,value,ts FROM agent_memory WHERE agent=? "
        "ORDER BY ts DESC LIMIT 50", (agent,)).fetchall()
    db.close()
    scored = []
    for r in rows:
        score = sum(1 for w in words
                    if w in r["value"].lower() or w in r["key"].lower())
        if score > 0:
            scored.append((score, dict(r)))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:limit]]
