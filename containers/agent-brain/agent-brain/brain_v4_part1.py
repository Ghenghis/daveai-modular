"""
brain_v4_part1.py — LEGACY MONOLITH (used only by deploy_all_v4.py to build brain.py on VPS).

DO NOT import this file directly. The modular architecture uses:
  brain_core.py, brain_db.py, brain_auth.py, brain_events.py,
  brain_llm.py, brain_graph.py, brain_skills.py, brain_tools.py,
  brain_watchdog.py, brain_api.py

This file is merged at deploy time by deploy_all_v4.py:
  brain_v4_part1.py + brain_v4_part2.py → /opt/agent-brain/brain.py (VPS)
"""
import os, subprocess, json, queue, threading, time, uuid, sqlite3, hashlib, smtplib
from datetime import datetime, timedelta
from typing import TypedDict, List, Optional
from email.mime.text import MIMEText
from dotenv import load_dotenv
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from litellm import completion
from fastapi import FastAPI, WebSocket, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

try:
    import jwt
    JWT_OK = True
except ImportError:
    JWT_OK = False

try:
    from agent_skills import ALL_SKILLS
    _SKILLS_LOADED = True
except Exception as _e:
    ALL_SKILLS = []
    _SKILLS_LOADED = False
    print(f"[brain] agent_skills not loaded: {_e}")

load_dotenv()

WORKSPACE   = os.getenv("WORKSPACE",    "/var/www/agentic-website")
LLM_BASE    = os.getenv("LITELLM_URL",  "http://127.0.0.1:4000/v1")
HEAVY       = os.getenv("HEAVY_MODEL",  "heavy-coder")
FAST        = os.getenv("FAST_MODEL",   "fast-agent")
AUTO        = os.getenv("AUTONOMY",     "supervised")
GIT_REMOTE  = os.getenv("GIT_REMOTE",  "origin")
GITLAB_URL  = os.getenv("GITLAB_URL",  "http://localhost:8929")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL",  "fnice1971@gmail.com")
SMTP_HOST   = os.getenv("SMTP_HOST",   "smtp.gmail.com")
SMTP_PORT   = int(os.getenv("SMTP_PORT","587"))
SMTP_USER   = os.getenv("SMTP_USER",   "")
SMTP_PASS   = os.getenv("SMTP_PASS",   "")
JWT_SECRET  = os.getenv("JWT_SECRET",  "daveai-jwt-secret-change-me-in-env")
DB_PATH     = "/opt/agent-brain/daveai.db"
VAULT_PATH  = "/opt/agent-brain/keyvault.json"

# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY, site TEXT DEFAULT 'main', name TEXT,
        path TEXT, template TEXT DEFAULT 'blank',
        created_at TEXT, updated_at TEXT, created_by TEXT DEFAULT 'user')""")
    db.execute("""CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT, detail TEXT, ts TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS admin_table (
        id INTEGER PRIMARY KEY, password_hash TEXT, email TEXT)""")
    db.commit()
    row = db.execute("SELECT id FROM admin_table").fetchone()
    if not row:
        pw_hash = hashlib.sha256("DaveAI2026!".encode()).hexdigest()
        db.execute("INSERT INTO admin_table VALUES (1,?,?)", (pw_hash, ADMIN_EMAIL))
        db.commit()
    return db

# ── Email ─────────────────────────────────────────────────────────────────────
def send_email(subject: str, body: str, to: str = None):
    if not SMTP_USER or not SMTP_PASS:
        print(f"[EMAIL SKIP - configure SMTP_USER/SMTP_PASS] {subject}")
        return False
    try:
        msg = MIMEText(body)
        msg["Subject"] = f"[DaveAI] {subject}"
        msg["From"] = SMTP_USER
        msg["To"] = to or ADMIN_EMAIL
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
        return True
    except Exception as e:
        print(f"[EMAIL ERR] {e}")
        return False

def log_event(event: str, detail: str = ""):
    try:
        db = get_db()
        db.execute("INSERT INTO analytics (event,detail,ts) VALUES (?,?,?)",
                   (event, detail[:200], datetime.now().isoformat()))
        db.commit(); db.close()
    except Exception: pass

# ── Auth ──────────────────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)

def make_token() -> str:
    if not JWT_OK: return "no-jwt-installed"
    payload = {"sub": "admin", "exp": datetime.utcnow() + timedelta(hours=24)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def is_admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> bool:
    if not creds: return False
    if not JWT_OK: return True
    try:
        jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        return True
    except Exception:
        return False

# ── Key Vault ─────────────────────────────────────────────────────────────────
def vault_read() -> dict:
    try:
        with open(VAULT_PATH) as f: return json.load(f)
    except Exception: return {}

def vault_write(data: dict):
    with open(VAULT_PATH, "w") as f: json.dump(data, f, indent=2)

if not os.path.exists(VAULT_PATH):
    vault_write({"openrouter_key": "", "gitlab_token": "", "gitlab_url": GITLAB_URL,
                 "huggingface_token": "", "notes": ""})

# ── Agent Status ──────────────────────────────────────────────────────────────
_pqueues: dict = {}
_agent_status: dict = {
    "supervisor": {"status":"idle","task":"","progress":0,"model":"","ts":""},
    "coder":      {"status":"idle","task":"","progress":0,"model":"","ts":""},
    "asset":      {"status":"idle","task":"","progress":0,"model":"","ts":""},
    "qa":         {"status":"idle","task":"","progress":0,"model":"","ts":""},
}

def agent_set(name: str, status: str, task: str, progress: int, model: str = ""):
    _agent_status[name] = {
        "status": status, "task": task, "progress": progress,
        "model": model, "ts": datetime.now().isoformat()
    }

def emit(q, evt: str, **data):
    if q is None: return
    try: q.put_nowait({"type": evt, **data})
    except Exception: pass

# ── Tools ─────────────────────────────────────────────────────────────────────
@tool
def shell_run(command: str) -> str:
    """Execute a shell command in the website workspace."""
    try:
        r = subprocess.run(command, shell=True, capture_output=True,
                           text=True, timeout=120, cwd=WORKSPACE)
        return r.stdout.strip() or r.stderr.strip() or "done"
    except subprocess.TimeoutExpired: return "error: timed out"
    except Exception as e: return f"error: {e}"

@tool
def file_write(path: str, content: str) -> str:
    """Write content to a file in the workspace."""
    try:
        full = path if os.path.isabs(path) else os.path.join(WORKSPACE, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f: f.write(content)
        return f"written: {full}"
    except Exception as e: return f"error: {e}"

@tool
def file_read(path: str) -> str:
    """Read file contents from the workspace."""
    try:
        full = path if os.path.isabs(path) else os.path.join(WORKSPACE, path)
        with open(full, encoding="utf-8") as f: return f.read()
    except Exception as e: return f"error: {e}"

@tool
def git_status_tool() -> str:
    """Show git status and last 5 commits."""
    r = subprocess.run("git status --short && echo '---' && git log --oneline -5",
                       shell=True, capture_output=True, text=True, cwd=WORKSPACE)
    return r.stdout.strip()

@tool
def gitlab_clone(project_path: str, target_subdir: str = "") -> str:
    """Clone a project from the local self-hosted GitLab instance.
    project_path: namespace/repo-name  e.g. 'dave/my-site'
    Reads gitlab_url and gitlab_token from the key vault.
    """
    agent_set("asset", "working", f"Cloning gitlab:{project_path[:50]}", 20, "")
    vault = vault_read()
    base_url = vault.get("gitlab_url", GITLAB_URL).rstrip("/")
    token    = vault.get("gitlab_token", "")
    if token:
        # Use personal access token auth: https://oauth2:TOKEN@host/...
        parsed = base_url.replace("http://","").replace("https://","")
        scheme = "https" if base_url.startswith("https") else "http"
        clone_url = f"{scheme}://oauth2:{token}@{parsed}/{project_path}.git"
    else:
        clone_url = f"{base_url}/{project_path}.git"
    repo_name = project_path.split("/")[-1]
    dest = os.path.join(WORKSPACE, target_subdir or repo_name)
    agent_set("asset", "working", f"git clone {project_path[:40]}", 50, "")
    r = subprocess.run(f"git clone {clone_url} {dest} 2>&1", shell=True,
                       capture_output=True, text=True, timeout=180)
    out = r.stdout.strip() or r.stderr.strip() or f"Cloned to {dest}"
    agent_set("asset", "done", f"Cloned {project_path[:40]}", 100, "")
    return out

@tool
def gitlab_list_projects() -> str:
    """List all accessible projects on the local GitLab instance via API."""
    vault = vault_read()
    base_url = vault.get("gitlab_url", GITLAB_URL).rstrip("/")
    token    = vault.get("gitlab_token", "")
    if not token:
        return "No gitlab_token in vault. Add it via POST /vault."
    import urllib.request
    req = urllib.request.Request(
        f"{base_url}/api/v4/projects?membership=true&per_page=20",
        headers={"PRIVATE-TOKEN": token}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            projects = json.loads(resp.read())
        return "\n".join(f"{p['path_with_namespace']} — {p.get('description','')[:60]}" for p in projects)
    except Exception as e:
        return f"GitLab API error: {e}"

@tool
def huggingface_download(model_id: str, local_dir: str = "") -> str:
    """Download a model or dataset from HuggingFace Hub."""
    agent_set("asset", "working", f"HF download: {model_id[:50]}", 30, "")
    vault = vault_read()
    token = vault.get("huggingface_token", "")
    dest = local_dir or f"/opt/models/{model_id.replace('/','--')}"
    env = f"HF_TOKEN={token} " if token else ""
    r = subprocess.run(
        f"{env}python3 -c \"from huggingface_hub import snapshot_download; "
        f"snapshot_download('{model_id}',local_dir='{dest}')\" 2>&1",
        shell=True, capture_output=True, text=True, timeout=300)
    agent_set("asset", "done", f"Downloaded {model_id}", 100, "")
    return r.stdout.strip() or r.stderr.strip() or f"Downloaded to {dest}"

@tool
def npm_install(package: str) -> str:
    """Install an npm package in the website workspace."""
    r = subprocess.run(f"npm install {package} 2>&1", shell=True,
                       capture_output=True, text=True, timeout=120, cwd=WORKSPACE)
    return r.stdout[-500:] or r.stderr[-500:] or "installed"

_LEGACY_TOOLS = [shell_run, file_write, file_read, git_status_tool,
                 gitlab_clone, gitlab_list_projects, huggingface_download, npm_install]

_skill_names = {t.name for t in ALL_SKILLS}
TOOLS = ALL_SKILLS + [t for t in _LEGACY_TOOLS if t.name not in _skill_names]
