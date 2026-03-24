"""brain_api.py — FastAPI: 20+ endpoints, SSE /stream, /events bus, /tools, /memory."""
import json, queue, threading, uuid, os
from datetime import datetime
from fastapi import FastAPI, WebSocket, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from brain_core import (
    WORKSPACE, PUBLIC_DIR, HEAVY, FAST, _agent_status, _pqueues, _event_bus,
    is_website_change, _agent_models,
)
from brain_db import (
    get_db, log_event, pages_list, page_create, page_update,
    page_delete, mem_set, mem_get, mem_search, recent_builds,
)
from brain_auth import (
    is_admin, require_admin, admin_login, admin_change_password,
    vault_read, vault_write, vault_masked, check_rate_limit,
)
from brain_users import (
    init_users_table, user_login, user_register,
    admin_list_users, admin_create_user, admin_reset_password,
    admin_change_role, admin_delete_user, get_user_from_token,
    user_change_password,
)
from brain_db_api import router as db_api_router, init_db_api_tables
from brain_events import (
    emit, agent_set, agent_reset_all, new_req_queue, close_req_queue,
    bus_subscribe, bus_unsubscribe, sse, sse_start, sse_end,
)
from brain_llm import llm_fast
from brain_skills import skills_status, get_tools
from brain_tools import git_log, git_rollback, TOOLS
from brain_watchdog import full_status, start_monitor
from brain_graph import invoke, quick_reply

app = FastAPI(title="DaveAI Brain", version="4.0.0")
app.add_middleware(CORSMiddleware,
                   allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(db_api_router)

# ── Rate-limit middleware ──────────────────────────────────────────────────────
# Separate strict bucket for admin login to prevent brute-force attacks
_admin_login_attempts: dict = {}
_admin_login_lock = threading.Lock()
_ADMIN_MAX_ATTEMPTS = 5       # per window
_ADMIN_WINDOW_SECONDS = 300   # 5-minute window


def _check_admin_rate_limit(ip: str) -> bool:
    """Return True if login attempt is allowed (max 5 per 5 minutes per IP)."""
    import time as _time
    now = _time.monotonic()
    with _admin_login_lock:
        rec = _admin_login_attempts.get(ip, {"count": 0, "window_start": now})
        # Reset window if expired
        if now - rec["window_start"] > _ADMIN_WINDOW_SECONDS:
            rec = {"count": 0, "window_start": now}
        rec["count"] += 1
        _admin_login_attempts[ip] = rec
        return rec["count"] <= _ADMIN_MAX_ATTEMPTS


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    from fastapi.responses import JSONResponse
    ip = request.client.host if request.client else "unknown"
    # Strict rate limit for admin login endpoint
    if request.url.path == "/admin/login" and request.method == "POST":
        if not _check_admin_rate_limit(ip):
            log_event("admin_login_ratelimit", ip)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many login attempts. Try again in 5 minutes."}
            )
    # General rate limit for streaming endpoints
    if request.url.path in ("/stream", "/chat", "/build"):
        if not check_rate_limit(ip):
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
    return await call_next(request)

# ── /chat (blocking) ───────────────────────────────────────────────────────────
@app.post("/chat")
async def chat(body: dict):
    import asyncio
    msg = body.get("message", "")
    log_event("chat", msg[:100])
    fn = invoke if is_website_change(msg) else quick_reply
    try:
        loop = asyncio.get_event_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(None, fn, msg, None), timeout=600)
    except asyncio.TimeoutError:
        return {"response": "Request timed out. Try a simpler request.", "error": True}

# ── /stream  (primary SSE endpoint) ───────────────────────────────────────────
@app.post("/stream")
async def stream_chat(body: dict):
    msg = body.get("message", "")
    req_id = str(uuid.uuid4())[:8]
    pq = new_req_queue(req_id)
    log_event("stream", msg[:100])

    def _run():
        import logging
        _log = logging.getLogger("stream")
        try:
            fn = invoke if is_website_change(msg) else quick_reply
            _log.info(f"Stream starting: fn={fn.__name__}, msg={msg[:80]}")
            result = fn(msg, pq)
            _log.info(f"Stream done: {str(result)[:120]}")
        except Exception as e:
            _log.error(f"Stream error: {e}", exc_info=True)
            emit(pq, "error", msg=str(e), progress=0)
        finally:
            pq.put(None)

    threading.Thread(target=_run, daemon=True).start()

    def _events():
        yield sse_start(req_id)
        while True:
            try:
                item = pq.get(timeout=600)
                if item is None:
                    yield sse_end(); break
                yield sse(item)
            except Exception:
                yield sse_end(); break
        close_req_queue(req_id)

    return StreamingResponse(_events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})

# ── /build (alias for /stream with build metadata) ────────────────────────────
@app.post("/build")
async def build_ep(body: dict):
    return await stream_chat(body)

# ── /quick ─────────────────────────────────────────────────────────────────────
@app.post("/quick")
async def quick_ep(body: dict):
    resp = llm_fast(body.get("message", ""),
                    "You are DaveAI assistant. Answer helpfully and concisely.")
    return {"response": resp, "commit": "", "plan": ""}

# ── /agents/status ─────────────────────────────────────────────────────────────
@app.get("/agents/status")
async def agents_status():
    return {"agents": _agent_status, "ts": datetime.now().isoformat()}

# ── /agent/stop — signal all running agents to stop ───────────────────────────
@app.post("/agent/stop")
async def agent_stop():
    """Terminate all active SSE streams and reset agent status to idle.
    The running LangGraph thread is daemon-mode and will be abandoned (it
    can't be killed mid-tool-call, but it will stop emitting events)."""
    stopped = 0
    # Close all open per-request queues — SSE generators will receive None and exit
    req_ids = list(_pqueues.keys())
    for req_id in req_ids:
        close_req_queue(req_id)
        stopped += 1
    # Reset all agent statuses to idle
    agent_reset_all()
    log_event("agent_stop", f"stopped {stopped} stream(s)")
    return {"status": "stopped", "streams_closed": stopped}

# ── /agents/{role}/model ───────────────────────────────────────────────────────
@app.post("/agents/{role}/model")
async def set_agent_model(role: str, request: Request, ok: bool = Depends(require_admin)):
    """Override the LLM model for a specific agent role at runtime."""
    body = await request.json()
    valid_roles = {"supervisor", "coder", "asset", "qa"}
    if role not in valid_roles:
        raise HTTPException(400, f"Unknown role: {role}")
    model = body.get("model", "").strip()
    if not model:
        raise HTTPException(400, "model is required")
    _agent_models[role] = model
    _agent_status[role] = _agent_status.get(role, {}) | {"model": model}
    log_event("agent_model", f"{role} → {model}")
    return {"status": "ok", "role": role, "model": model}

# ── /admin ─────────────────────────────────────────────────────────────────────
@app.post("/admin/login")
async def admin_login_ep(body: dict):
    email = body.get("email", "")
    password = body.get("password", "")
    # Try multi-user login first if email provided
    if email:
        try:
            result = user_login(email, password)
            if "error" not in result:
                return result
        except Exception:
            pass
    # Legacy: password-only admin login (checks admin_table)
    return admin_login(password)

@app.post("/admin/password")
async def change_pw_ep(body: dict, ok: bool = Depends(require_admin)):
    admin_change_password(body.get("password", ""))
    return {"status": "ok"}

# ── Multi-user Auth ───────────────────────────────────────────────────────────
@app.post("/auth/login")
async def auth_login_ep(body: dict):
    email = body.get("email", "")
    password = body.get("password", "")
    if not email or not password:
        raise HTTPException(400, "Email and password required")
    result = user_login(email, password)
    if "error" in result:
        raise HTTPException(401, detail=result["error"])
    log_event("auth_login", email)
    return result

@app.post("/auth/register")
async def auth_register_ep(body: dict):
    email = body.get("email", "")
    password = body.get("password", "")
    display_name = body.get("display_name", "")
    if not email or not password:
        raise HTTPException(400, "Email and password required")
    result = user_register(email, password, display_name)
    if "error" in result:
        raise HTTPException(400, detail=result["error"])
    log_event("auth_register", email)
    return result

@app.get("/admin/users")
async def admin_users_ep(ok: bool = Depends(require_admin)):
    return {"users": admin_list_users()}

@app.post("/admin/users")
async def admin_create_user_ep(body: dict, ok: bool = Depends(require_admin)):
    result = admin_create_user(
        body.get("email", ""), body.get("password", ""),
        body.get("display_name", ""), body.get("role", "user"))
    if "error" in result:
        raise HTTPException(400, detail=result["error"])
    return result

@app.post("/admin/users/{user_id}/reset-password")
async def admin_reset_pw_ep(user_id: int, body: dict, ok: bool = Depends(require_admin)):
    result = admin_reset_password(user_id, body.get("password", ""))
    if "error" in result:
        raise HTTPException(400, detail=result["error"])
    return result

@app.post("/admin/users/{user_id}/role")
async def admin_role_ep(user_id: int, body: dict, ok: bool = Depends(require_admin)):
    result = admin_change_role(user_id, body.get("role", "user"))
    if "error" in result:
        raise HTTPException(400, detail=result["error"])
    return result

@app.delete("/admin/users/{user_id}")
async def admin_delete_user_ep(user_id: int, request: Request, ok: bool = Depends(require_admin)):
    # Get admin user_id from token
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header else ""
    admin_info = get_user_from_token(token)
    admin_uid = admin_info["user_id"] if admin_info else 0
    result = admin_delete_user(user_id, admin_uid)
    if "error" in result:
        raise HTTPException(400, detail=result["error"])
    return result

# ── /vault ─────────────────────────────────────────────────────────────────────
@app.get("/vault")
async def get_vault_ep(ok: bool = Depends(require_admin)):
    return vault_masked()

@app.post("/vault")
async def set_vault_ep(body: dict, ok: bool = Depends(require_admin)):
    current = vault_read()
    current.update(body)
    vault_write(current)
    return {"status": "ok"}

# ── /pages ─────────────────────────────────────────────────────────────────────
@app.get("/pages")
async def list_pages_ep(site: str = "main"):
    return {"pages": pages_list(site)}

@app.post("/pages")
async def create_page_ep(body: dict):
    page = page_create(body.get("name", "New Page"),
                       body.get("site", "main"),
                       body.get("template", "blank"))
    log_event("page_created", f"{page['site']}/{page['name']}")
    return page

@app.put("/pages/{page_id}")
async def update_page_ep(page_id: str, body: dict):
    page_update(page_id, name=body.get("name"), content=body.get("content"))
    return {"status": "ok"}

@app.delete("/pages/{page_id}")
async def delete_page_ep(page_id: str, ok: bool = Depends(require_admin)):
    page_delete(page_id)
    log_event("page_deleted", page_id)
    return {"status": "deleted"}

# ── /projects ──────────────────────────────────────────────────────────────────
@app.get("/projects")
async def list_projects_ep():
    try:
        sites = [
            {"name": d, "path": f"/var/www/{d}",
             "active": f"/var/www/{d}" == WORKSPACE}
            for d in os.listdir("/var/www")
            if os.path.isdir(f"/var/www/{d}") and not d.startswith(".")
        ]
        return {"projects": sites or [{"name": "agentic-website",
                                       "path": WORKSPACE, "active": True}]}
    except Exception:
        return {"projects": [{"name": "agentic-website",
                               "path": WORKSPACE, "active": True}]}

# ── /gitlab ────────────────────────────────────────────────────────────────────
@app.get("/gitlab/projects")
async def gitlab_projects_ep():
    from brain_tools import gitlab_list_projects
    return {"result": gitlab_list_projects.invoke({})}

@app.post("/gitlab/clone")
async def gitlab_clone_ep(body: dict):
    from brain_tools import gitlab_clone
    pp = body.get("project_path", "")
    if not pp:
        raise HTTPException(status_code=400, detail="project_path required")
    return {"result": gitlab_clone.invoke({"project_path": pp,
                                           "target_subdir": body.get("target_subdir", "")})}

# ── /tools ─────────────────────────────────────────────────────────────────────
@app.get("/tools")
async def list_tools_ep(role: str = "all"):
    status = skills_status()
    tools = get_tools(role)
    return {
        "total": status["total"],
        "loaded": status["loaded"],
        "by_role": status["by_role"],
        "tools": [{"name": t.name,
                   "description": (t.description or "").split("\n")[0][:100]}
                  for t in tools],
    }

# ── /tools/shell/run, /tools/file/write, /tools/file/read, /tools/file/list ──
# These REST endpoints allow agent_skills_p1.py to call via _zc() using
# ZEROCLAW_URL pointing at the brain (port 8888) or via env override.
@app.post("/tools/shell/run")
async def tools_shell_run(body: dict):
    """Execute a shell command in the workspace. Body: {command: str}"""
    from brain_tools import shell_run
    cmd = body.get("command", "")
    if not cmd:
        raise HTTPException(400, "Missing 'command'")
    try:
        result = shell_run.invoke({"command": cmd})
    except Exception as e:
        return {"output": str(e), "ok": False}
    failed = isinstance(result, str) and result.startswith("error:")
    return {"output": result, "ok": not failed}

@app.post("/tools/file/write")
async def tools_file_write(body: dict):
    """Write a file in the workspace. Body: {path: str, content: str}"""
    from brain_tools import file_write
    path = body.get("path", "")
    content = body.get("content", "")
    if not path:
        raise HTTPException(400, "Missing 'path'")
    try:
        result = file_write.invoke({"path": path, "content": content})
    except Exception as e:
        return {"message": str(e), "ok": False}
    failed = isinstance(result, str) and result.startswith("error:")
    return {"message": result, "ok": not failed}

@app.post("/tools/file/read")
async def tools_file_read(body: dict):
    """Read a file from the workspace. Body: {path: str}"""
    from brain_tools import file_read
    path = body.get("path", "")
    if not path:
        raise HTTPException(400, "Missing 'path'")
    try:
        result = file_read.invoke({"path": path})
    except Exception as e:
        return {"content": str(e), "ok": False}
    failed = isinstance(result, str) and result.startswith("error:")
    return {"content": result, "ok": not failed}

@app.post("/tools/file/list")
async def tools_file_list(body: dict):
    """List files in workspace. Body: {path: str, recursive: bool, depth: int}"""
    import os
    from brain_core import WORKSPACE
    from brain_tools import _safe_path
    rel = body.get("path", "")
    try:
        depth = int(body.get("depth", 3))
    except (ValueError, TypeError):
        depth = 3
    try:
        base = _safe_path(rel) if rel else WORKSPACE
    except ValueError as ve:
        return {"tree": f"error: {ve}", "ok": False}
    skip = {".git", "node_modules", ".next", "__pycache__", ".turbo", "dist", "build"}
    lines = []
    for root, dirs, files in os.walk(base):
        dirs[:] = sorted(d for d in dirs if d not in skip)
        lv = root.replace(base, "").count(os.sep)
        if lv >= depth:
            dirs.clear()
            continue
        indent = "  " * lv
        lines.append(f"{indent}{os.path.basename(root) or '.'}/")
        for f in sorted(files):
            sz = os.path.getsize(os.path.join(root, f)) // 1024
            lines.append(f"{indent}  {f} ({sz}KB)")
    return {"tree": "\n".join(lines[:300]), "ok": True}

@app.post("/tools/http/get")
async def tools_http_get(body: dict):
    """Fetch a URL via GET. Body: {url: str}. Returns {body: str, status: int, ok: bool}"""
    import urllib.request, urllib.error
    url = body.get("url", "")
    if not url:
        raise HTTPException(400, "Missing 'url'")
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            text = r.read().decode("utf-8", errors="replace")[:8000]
            return {"body": text, "status": r.status, "ok": True}
    except urllib.error.HTTPError as e:
        return {"body": str(e), "status": e.code, "ok": False}
    except Exception as e:
        return {"body": str(e), "status": 0, "ok": False}

@app.post("/tools/http/post")
async def tools_http_post(body: dict):
    """POST JSON to a URL. Body: {url: str, body: any, content_type: str}. Returns {body: str, status: int, ok: bool}"""
    import urllib.request, urllib.error
    url = body.get("url", "")
    if not url:
        raise HTTPException(400, "Missing 'url'")
    payload = body.get("body", {})
    content_type = body.get("content_type", "application/json")
    try:
        data = json.dumps(payload).encode() if isinstance(payload, (dict, list)) else str(payload).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": content_type}, method="POST")
        with urllib.request.urlopen(req, timeout=15) as r:
            text = r.read().decode("utf-8", errors="replace")[:8000]
            return {"body": text, "status": r.status, "ok": True}
    except urllib.error.HTTPError as e:
        return {"body": str(e), "status": e.code, "ok": False}
    except Exception as e:
        return {"body": str(e), "status": 0, "ok": False}

# ── /tts — Voice Synthesis & Cloning API ─────────────────────────────────────
@app.post("/tts/synthesize")
async def tts_synthesize_ep(body: dict):
    """Synthesize speech from text.
    Body: {text: str, voice?: str, backend?: str, speed?: float}
    """
    import asyncio
    from brain_pipelines import tts_synthesize, TTSBackend
    text = body.get("text", "")
    if not text:
        raise HTTPException(400, "Missing 'text'")
    voice = body.get("voice", "af_heart")
    speed = float(body.get("speed", 1.0))
    backend_name = body.get("backend", "outetts")
    try:
        backend = TTSBackend(backend_name)
    except ValueError:
        raise HTTPException(400, f"Unknown backend: {backend_name}. Valid: {[b.value for b in TTSBackend]}")
    log_event("tts_synthesize", f"backend={backend_name} voice={voice} len={len(text)}")
    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: tts_synthesize(text, voice=voice, speed=speed, backend=backend)),
            timeout=120,
        )
        return result
    except asyncio.TimeoutError:
        return {"error": "TTS synthesis timed out (2 min limit)"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/tts/clone")
async def tts_clone_ep(body: dict):
    """Clone a voice and synthesize speech.
    Body: {text: str, reference_audio: str, backend?: str, speed?: float}
    """
    import asyncio
    from brain_pipelines import tts_clone_voice, TTSBackend
    text = body.get("text", "")
    ref_audio = body.get("reference_audio", "")
    if not text:
        raise HTTPException(400, "Missing 'text'")
    if not ref_audio:
        raise HTTPException(400, "Missing 'reference_audio' path")
    speed = float(body.get("speed", 1.0))
    backend_name = body.get("backend", "chatterbox")
    try:
        backend = TTSBackend(backend_name)
    except ValueError:
        raise HTTPException(400, f"Unknown backend: {backend_name}")
    log_event("tts_clone", f"backend={backend_name} ref={ref_audio[:60]}")
    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: tts_clone_voice(text, ref_audio, backend=backend, speed=speed)),
            timeout=180,
        )
        return result
    except asyncio.TimeoutError:
        return {"error": "Voice cloning timed out (3 min limit)"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/tts/voices")
async def tts_voices_ep(backend: str = ""):
    """List available voices for a backend (or all backends)."""
    from brain_pipelines import tts_list_voices, TTSBackend
    try:
        be = TTSBackend(backend) if backend else None
    except ValueError:
        raise HTTPException(400, f"Unknown backend: {backend}")
    return tts_list_voices(be)

@app.get("/tts/backends")
async def tts_backends_ep():
    """Check health of all TTS backends."""
    import asyncio
    from brain_pipelines import tts_all_backends_status
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, tts_all_backends_status)
    return {"backends": result, "ts": datetime.now().isoformat()}

@app.post("/tts/dispatch")
async def tts_dispatch_ep(body: dict):
    """Auto-select the best TTS backend for a prompt and synthesize.
    Body: {prompt: str, voice?: str, reference_audio?: str}
    """
    import asyncio
    from brain_pipelines import dispatch
    prompt = body.get("prompt", "")
    if not prompt:
        raise HTTPException(400, "Missing 'prompt'")
    log_event("tts_dispatch", prompt[:80])
    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: dispatch(prompt, **body)),
            timeout=180,
        )
        return result
    except asyncio.TimeoutError:
        return {"error": "TTS dispatch timed out (3 min limit)"}
    except Exception as e:
        return {"error": str(e)}

# ── /memory ────────────────────────────────────────────────────────────────────
@app.get("/memory/{agent}")
async def get_memory_ep(agent: str, q: str = "", ok: bool = Depends(require_admin)):
    if q:
        return {"results": mem_search(agent, q)}
    return {"value": mem_get(agent, "workspace_tree")}

@app.post("/memory/{agent}")
async def set_memory_ep(agent: str, body: dict, ok: bool = Depends(require_admin)):
    mem_set(agent, body.get("key", "note"), body.get("value", ""))
    return {"status": "ok"}

# ── /events (global SSE monitor) ──────────────────────────────────────────────
@app.get("/events")
async def events_monitor():
    listener = bus_subscribe()

    def _stream():
        try:
            # replay last 20 buffered events
            for ev in _event_bus[-20:]:
                yield sse(ev)
            while True:
                try:
                    item = listener.get(timeout=60)
                    yield sse(item)
                except Exception:
                    yield sse({"type": "ping"})
        finally:
            bus_unsubscribe(listener)

    return StreamingResponse(_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})

# ── /log /rollback ─────────────────────────────────────────────────────────────
def _structured_git_log(n: int = 20) -> list:
    """Parse git log into [{hash, message, author, date}] list."""
    import subprocess
    fmt = "%H\x1f%s\x1f%an\x1f%aI"   # hash, subject, author, ISO date
    r = subprocess.run(
        f"git log --format='{fmt}' -{n}",
        shell=True, capture_output=True, text=True, cwd=WORKSPACE)
    commits = []
    for line in r.stdout.strip().splitlines():
        parts = line.split("\x1f")
        if len(parts) == 4:
            commits.append({"hash": parts[0], "message": parts[1],
                            "author": parts[2], "date": parts[3]})
    return commits

@app.get("/log")
async def log_ep(n: int = 20):
    return {"log": _structured_git_log(n), "builds": recent_builds(5)}

@app.post("/rollback")
async def rollback_ep(body: dict, ok: bool = Depends(require_admin)):
    ref = body.get("ref", "HEAD~1")
    git_rollback(ref)
    return {"status": "ok", "rolled_back_to": ref}

@app.get("/health")
async def health():
    sk = skills_status()
    return {
        "status": "ok", "version": "4.0.0",
        "workspace": WORKSPACE,
        "public_dir": PUBLIC_DIR,
        "tools": sk["total"], "skills_loaded": sk["loaded"],
        "agents": list(_agent_status.keys()),
        "ts": datetime.now().isoformat(),
    }

@app.get("/status")
async def status_ep():
    return {
        "version": "4.0.0", "workspace": WORKSPACE,
        "log": git_log(5), "agents": _agent_status,
        "builds": recent_builds(3),
    }

@app.get("/watchdog")
async def watchdog_ep(ok: bool = Depends(require_admin)):
    return full_status()

@app.get("/analytics")
async def analytics_ep(ok: bool = Depends(require_admin)):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM analytics ORDER BY ts DESC LIMIT 100").fetchall()
    db.close()
    return {"events": [dict(r) for r in rows]}

# ── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    import asyncio
    await ws.accept()
    log_event("ws_connect", ws.client.host if ws.client else "")
    pq = new_req_queue("ws")
    while True:
        try:
            data = await ws.receive_json()
            msg = data.get("message", "")

            def _bg():
                fn = invoke if is_website_change(msg) else quick_reply
                fn(msg, pq)
                pq.put(None)

            threading.Thread(target=_bg, daemon=True).start()
            while True:
                try:
                    item = pq.get(timeout=0.08)
                    if item is None: break
                    await ws.send_json(item)
                except queue.Empty:
                    await asyncio.sleep(0.04)
        except Exception as e:
            try: await ws.send_json({"type": "error", "msg": str(e)})
            except Exception: break
    close_req_queue("ws")

# ── Startup event ───────────────────────────────────────────────────────────────
# ── /checkpoint ────────────────────────────────────────────────────────────────
@app.get("/checkpoint/status")
async def checkpoint_status_ep(site: str = "main", ok: bool = Depends(require_admin)):
    """Get the most recent active checkpoint for a site."""
    from brain_checkpoint import checkpoint_latest_for_site, checkpoint_list
    latest = checkpoint_latest_for_site(site)
    recent = checkpoint_list(site, limit=5)
    return {
        "latest": latest,
        "recent": recent,
        "site": site,
        "ts": datetime.now().isoformat(),
    }

@app.post("/checkpoint/expire")
async def checkpoint_expire_ep(ok: bool = Depends(require_admin)):
    """Delete checkpoints older than TTL (24h). Returns count deleted."""
    from brain_checkpoint import checkpoint_expire
    n = checkpoint_expire()
    log_event("checkpoint_expire", f"deleted {n} old checkpoints")
    return {"status": "ok", "deleted": n}

# ── /budget/status ──────────────────────────────────────────────────────────────
@app.get("/budget/status")
async def budget_status_ep():
    """Get current circuit breaker limits and budget config."""
    try:
        from brain_graph import _CB
        return {"limits": _CB, "ts": datetime.now().isoformat()}
    except ImportError:
        return {"limits": {}, "error": "brain_graph not loaded", "ts": datetime.now().isoformat()}

# ── /qa/report ──────────────────────────────────────────────────────────────────
@app.post("/qa/report")
async def qa_report_ep(body: dict):
    """
    Run visual QA on a URL and return a report.
    Body: {url: str, site_name: str}
    """
    import asyncio
    url       = body.get("url", "http://localhost:3001")
    site_name = body.get("site_name", "main")
    log_event("qa_report", url)
    try:
        from brain_visual_qa import visual_qa_loop
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, visual_qa_loop, url, site_name),
            timeout=300,
        )
        return result
    except asyncio.TimeoutError:
        return {"error": "QA timed out (5 min limit)", "passed": False}
    except ImportError:
        return {"error": "brain_visual_qa not available", "passed": False}
    except Exception as e:
        return {"error": str(e), "passed": False}

# ── /openhands/status ───────────────────────────────────────────────────────────
@app.get("/openhands/status")
async def openhands_status_ep():
    """Check if OpenHands Docker agent is available."""
    try:
        from brain_openhands import openhands_health
        return openhands_health()
    except ImportError:
        return {"ok": False, "msg": "brain_openhands not available"}

# ── /deploy ─────────────────────────────────────────────────────────────────────
@app.post("/deploy/staging")
async def deploy_staging_ep(ok: bool = Depends(require_admin)):
    """Deploy to staging environment (port 3002). Runs build + PM2 reload."""
    import asyncio
    log_event("deploy_staging", "started")
    try:
        from brain_deploy import deploy_staging
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, deploy_staging),
            timeout=360,
        )
        log_event("deploy_staging", "done" if result.get("ok") else "failed")
        return result
    except asyncio.TimeoutError:
        return {"ok": False, "message": "Deploy timed out (6 min limit)"}
    except ImportError:
        return {"ok": False, "message": "brain_deploy not available"}

@app.post("/deploy/production")
async def deploy_production_ep(ok: bool = Depends(require_admin)):
    """Full blue/green deploy: staging → health check → production swap. Triple failsafe."""
    import asyncio
    log_event("deploy_production", "started")
    try:
        from brain_deploy import full_deploy
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, full_deploy),
            timeout=600,
        )
        log_event("deploy_production", "done" if result.get("ok") else "failed")
        return result
    except asyncio.TimeoutError:
        return {"ok": False, "stage": "timeout", "message": "Deploy timed out (10 min limit)"}
    except ImportError:
        return {"ok": False, "message": "brain_deploy not available"}

@app.post("/deploy/rollback")
async def deploy_rollback_ep(ok: bool = Depends(require_admin)):
    """Emergency rollback to last-good-deploy git tag."""
    import asyncio
    log_event("deploy_rollback", "started")
    try:
        from brain_deploy import rollback_to_last_good
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, rollback_to_last_good),
            timeout=120,
        )
        log_event("deploy_rollback", "done" if result.get("ok") else "failed")
        return result
    except asyncio.TimeoutError:
        return {"ok": False, "message": "Rollback timed out"}
    except ImportError:
        return {"ok": False, "message": "brain_deploy not available"}

# ── /discuss — Agent Inter-Communication ──────────────────────────────────────
@app.post("/discuss/start")
async def discuss_start_ep(body: dict):
    """Start a new agent discussion. Body: {topic: str, agents: [str], max_turns: int}"""
    from brain_discuss import discussion_create
    topic = body.get("topic", "")
    if not topic:
        raise HTTPException(400, "topic is required")
    agents = body.get("agents", ["alice", "charlotte", "george"])
    max_turns = int(body.get("max_turns", 16))
    disc = discussion_create(topic, agents, max_turns)
    log_event("discuss_start", f"{disc['id']}: {topic[:80]}")
    return disc

@app.get("/discuss/list")
async def discuss_list_ep():
    from brain_discuss import discussion_list
    return {"discussions": discussion_list()}

@app.get("/discuss/{disc_id}")
async def discuss_get_ep(disc_id: str):
    from brain_discuss import discussion_get
    disc = discussion_get(disc_id)
    if not disc:
        raise HTTPException(404, "Discussion not found")
    return disc

@app.post("/discuss/{disc_id}/run")
async def discuss_run_ep(disc_id: str):
    """Run the discussion loop, streaming turns via SSE."""
    import asyncio
    from brain_discuss import discussion_get, discussion_run
    disc = discussion_get(disc_id)
    if not disc:
        raise HTTPException(404, "Discussion not found")
    log_event("discuss_run", disc_id)

    turn_queue = queue.Queue()

    def _on_turn(turn):
        turn_queue.put(turn)

    def _run():
        try:
            discussion_run(disc_id, on_turn=_on_turn)
        except Exception as e:
            turn_queue.put({"error": str(e)})
        finally:
            turn_queue.put(None)

    threading.Thread(target=_run, daemon=True).start()

    def _events():
        yield f"data: {json.dumps({'type': 'discussion_started', 'discussionId': disc_id})}\n\n"
        while True:
            try:
                item = turn_queue.get(timeout=300)
                if item is None:
                    yield f"data: {json.dumps({'type': 'discussion_completed', 'discussionId': disc_id})}\n\n"
                    break
                if "error" in item:
                    yield f"data: {json.dumps({'type': 'error', 'msg': item['error']})}\n\n"
                    break
                yield f"data: {json.dumps({'type': 'turn_added', 'discussionId': disc_id, 'turn': item})}\n\n"
            except Exception:
                yield f"data: {json.dumps({'type': 'error', 'msg': 'timeout'})}\n\n"
                break

    return StreamingResponse(_events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})

@app.post("/discuss/{disc_id}/inject")
async def discuss_inject_ep(disc_id: str, body: dict):
    """Inject a user message into a running discussion."""
    from brain_discuss import discussion_inject
    content = body.get("content", "")
    if not content:
        raise HTTPException(400, "content is required")
    turn = discussion_inject(disc_id, content)
    if not turn:
        raise HTTPException(404, "Discussion not found")
    return turn

@app.on_event("startup")
async def on_startup():
    # Initialize multi-user auth tables
    try:
        init_users_table()
        log_event("users_init", "users table ready")
    except Exception as _e:
        log_event("users_init_warn", str(_e))
    # Initialize /db/* API tables
    try:
        init_db_api_tables()
        log_event("db_api_init", "db api tables ready")
    except Exception as _e:
        log_event("db_api_init_warn", str(_e))
    start_monitor(interval_s=60)
    # Wire self-improvement scheduler as a background daemon thread
    # Self-improve thread DISABLED — it competes with coder agent for LLM/GPU.
    # Run self-improve as a separate PM2 process with lower priority instead.
    log_event("self_improve", "startup thread disabled — use PM2 process if needed")
    # Register core brain_tools in skill registry (late binding avoids circular import)
    try:
        from brain_tools import file_write, file_read, shell_run, git_status_tool
        from brain_skills import TOOLS_BY_NAME, ALL_SKILLS
        for _t in [file_write, file_read, shell_run, git_status_tool]:
            if _t.name not in TOOLS_BY_NAME:
                TOOLS_BY_NAME[_t.name] = _t
                ALL_SKILLS.append(_t)
        log_event("tools", f"registered core tools: {[t.name for t in [file_write, file_read, shell_run, git_status_tool]]}")
    except Exception as _e:
        log_event("tools_warn", f"could not register core tools: {_e}")
    log_event("brain_start", "v4 started")
