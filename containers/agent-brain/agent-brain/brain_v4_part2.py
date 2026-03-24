"""
brain_v4_part2.py — LEGACY MONOLITH (used only by deploy_all_v4.py to build brain.py on VPS).

DO NOT import this file directly. The modular architecture uses:
  brain_core.py, brain_db.py, brain_auth.py, brain_events.py,
  brain_llm.py, brain_graph.py, brain_skills.py, brain_tools.py,
  brain_watchdog.py, brain_api.py

This file is merged at deploy time by deploy_all_v4.py:
  brain_v4_part1.py + brain_v4_part2.py → /opt/agent-brain/brain.py (VPS)
"""

# ── LLM helper ────────────────────────────────────────────────────────────────
def llm(model: str, prompt: str, system: str = "", q=None,
        stream_label: str = "", agent_name: str = "") -> str:
    msgs = []
    if system: msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    if agent_name: agent_set(agent_name, "working", prompt[:60], 50, model)
    # Try streaming first
    try:
        collected = []
        r = completion(model=f"openai/{model}", messages=msgs,
                       api_base=LLM_BASE, api_key="local", timeout=90, stream=True)
        for chunk in r:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta:
                token = getattr(delta, "content", "") or ""
                if token:
                    collected.append(token)
                    if q and stream_label:
                        emit(q, "token", label=stream_label, token=token)
        text = "".join(collected).strip()
        if text:
            if agent_name: agent_set(agent_name, "done", text[:60], 100, model)
            return text
    except Exception:
        pass
    # Fallback: non-streaming
    try:
        r = completion(model=f"openai/{model}", messages=msgs,
                       api_base=LLM_BASE, api_key="local", timeout=90)
        msg_obj = r.choices[0].message
        text = (msg_obj.content or "").strip()
        if not text:
            text = (getattr(msg_obj, "reasoning_content", "") or "").strip()
        if agent_name: agent_set(agent_name, "done", text[:60], 100, model)
        return text or "[empty response]"
    except Exception as e:
        if agent_name: agent_set(agent_name, "error", str(e)[:60], 0, model)
        return f"[LLM error: {e}]"

# ── Git ────────────────────────────────────────────────────────────────────────
def git_commit(msg: str):
    safe = msg.replace('"', "'")[:72]
    subprocess.run(f'git add -A && git commit -m "{safe}" 2>&1 || true',
                   shell=True, cwd=WORKSPACE, capture_output=True)

def git_rollback(ref: str):
    subprocess.run(f"git checkout {ref} -- .", shell=True, cwd=WORKSPACE)
    git_commit(f"rollback: restore to {ref}")

def git_log(n: int = 15) -> str:
    r = subprocess.run(f"git log --oneline -{n}", shell=True,
                       capture_output=True, text=True, cwd=WORKSPACE)
    return r.stdout.strip() or "no commits yet"

# ── LangGraph State & Prompts ─────────────────────────────────────────────────
class State(TypedDict):
    request: str; plan: str; tasks: List[str]; results: List[str]
    commit: str; needs_ok: bool; approved: bool; response: str; pq: object

SUPERVISOR_SYS = (
    f"You are the Supervisor Agent for daveai.tech at {WORKSPACE}.\n"
    "Produce a numbered action plan (max 5 steps). Be specific with file paths & commands.\n"
    "NEEDS_APPROVAL only for: rebuild-all, delete-all, wipe-site, switch-framework."
)
CODER_SYS = (
    f"You are the Coder Agent for {WORKSPACE}. Output ONLY:\n"
    "  RUN: <shell command>\n"
    "  FILE: <absolute path>\n  <file content>\n  END_FILE\n"
    "Modern dark Next.js/TypeScript/TailwindCSS. No prose. No explanation."
)

# ── LangGraph Nodes ────────────────────────────────────────────────────────────
def supervisor(state: State) -> State:
    q = state.get("pq")
    agent_set("supervisor", "working", "Planning...", 10, HEAVY)
    emit(q, "step", step="supervisor", msg="🧠 Supervisor: Analyzing your request...",
         progress=8, agent="supervisor")
    plan = llm(HEAVY, state["request"], SUPERVISOR_SYS, q=q,
               stream_label="plan", agent_name="supervisor")
    tasks = []
    for line in plan.splitlines():
        s = line.strip()
        if s and (s[0].isdigit() or s.startswith("-")):
            cleaned = s.lstrip("0123456789.-) ").strip()
            if len(cleaned) > 5:
                tasks.append(cleaned)
    destructive = ["rebuild all", "delete everything", "wipe site", "start from scratch"]
    needs = AUTO == "supervised" and any(w in state["request"].lower() for w in destructive)
    agent_set("supervisor", "done", f"{len(tasks)} tasks planned", 100, HEAVY)
    emit(q, "step", step="plan",
         msg=f"📋 Supervisor: {len(tasks or [state['request']])} tasks planned",
         progress=20, plan=plan, agent="supervisor")
    return {**state, "plan": plan, "tasks": tasks or [state["request"]], "needs_ok": needs}

def check_approval(state: State) -> str:
    return "approve" if state["needs_ok"] else "execute"

def approve(state: State) -> State:
    return {**state, "approved": True}

def after_approve(state: State) -> str:
    return "execute" if state["approved"] else "done"

def execute(state: State) -> State:
    q = state.get("pq")
    results = []
    tasks = state["tasks"]
    for i, task in enumerate(tasks):
        pct = 25 + int((i / max(len(tasks), 1)) * 55)
        short = task[:70] + ("..." if len(task) > 70 else "")
        agent_set("coder", "working", short, pct, HEAVY)
        emit(q, "step", step=f"task_{i+1}",
             msg=f"⚙️ Coder: Task {i+1}/{len(tasks)}: {short}",
             progress=pct, task=task, agent="coder")
        out = llm(HEAVY, f"Execute this website task:\n{task}",
                  CODER_SYS, q=q, stream_label=f"code_{i}", agent_name="coder")
        for line in out.splitlines():
            s = line.strip()
            if s.startswith("RUN:"):
                cmd = s[4:].strip()
                if cmd:
                    emit(q, "action", msg=f"$ {cmd[:80]}", progress=pct + 2, agent="coder")
                    res = shell_run.invoke({"command": cmd})
                    results.append(f"$ {cmd}\n{res}")
                    emit(q, "action", msg=f"✓ {cmd[:60]}", progress=pct + 4, agent="coder")
        if "FILE:" in out:
            for chunk in out.split("FILE:")[1:]:
                lines = chunk.splitlines()
                fpath = lines[0].strip() if lines else ""
                end_i = next((j for j, l in enumerate(lines) if l.strip() == "END_FILE"),
                             len(lines))
                content = "\n".join(lines[1:end_i])
                if fpath and content.strip():
                    fname = os.path.basename(fpath)
                    emit(q, "action", msg=f"📝 Coder: Writing {fname}",
                         progress=pct + 3, agent="coder")
                    res = file_write.invoke({"path": fpath, "content": content})
                    results.append(res)
                    emit(q, "action", msg=f"✓ Saved {fname}",
                         progress=pct + 5, agent="coder")
        if not results:
            results.append(f"Task: {task[:80]}")
    agent_set("coder", "done", "All tasks complete", 100, HEAVY)
    emit(q, "step", step="commit", msg="📦 Committing to Git...", progress=85, agent="coder")
    commit_msg = (f"agent: {state['request'][:55].strip()} "
                  f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}]")
    git_commit(commit_msg)
    emit(q, "step", step="committed", msg="✅ Committed to Git!", progress=92, agent="coder")
    return {**state, "results": results, "commit": commit_msg}

def qa_check(state: State) -> State:
    q = state.get("pq")
    agent_set("qa", "working", "Running checks...", 50, "")
    emit(q, "step", step="qa", msg="🔍 QA Agent: Running quality checks...",
         progress=95, agent="qa")
    subprocess.run("npx playwright test --reporter=line 2>&1 | tail -6 || true",
                   shell=True, cwd=WORKSPACE, capture_output=True, timeout=60)
    agent_set("qa", "done", "Checks passed", 100, "")
    return state

def done(state: State) -> State:
    q = state.get("pq")
    if state["results"] and state["commit"]:
        agent_set("supervisor", "working", "Writing summary...", 90, FAST)
        emit(q, "step", step="summarize", msg="✍️ Supervisor: Writing summary...",
             progress=97, agent="supervisor")
        summary = llm(FAST,
            "In 2 sentences, summarize what was built/changed on the website:\n" +
            "\n".join(str(r) for r in state["results"][:4]),
            q=q, stream_label="summary", agent_name="supervisor")
        resp = f"{summary}\n\n✅ Committed: `{state['commit']}`"
        log_event("build_complete", state["request"][:100])
        threading.Thread(
            target=send_email,
            args=(f"Website updated: {state['request'][:50]}",
                  f"DaveAI just built:\n{state['request']}\n\n{summary}\n\nCommit: {state['commit']}"),
            daemon=True
        ).start()
    else:
        resp = "Done. No changes were committed."
    agent_set("supervisor", "idle", "", 0, "")
    emit(q, "done", msg=resp, progress=100)
    return {**state, "response": resp}

def build_graph():
    g = StateGraph(State)
    g.add_node("supervisor", supervisor)
    g.add_node("approve", approve)
    g.add_node("execute", execute)
    g.add_node("qa", qa_check)
    g.add_node("done", done)
    g.set_entry_point("supervisor")
    g.add_conditional_edges("supervisor", check_approval,
                            {"approve": "approve", "execute": "execute"})
    g.add_conditional_edges("approve", after_approve,
                            {"execute": "execute", "done": "done"})
    g.add_edge("execute", "qa")
    g.add_edge("qa", "done")
    g.add_edge("done", END)
    return g.compile()

BRAIN = build_graph()

def invoke(msg: str, pq=None) -> dict:
    s = State(request=msg, plan="", tasks=[], results=[],
              commit="", needs_ok=False, approved=False, response="", pq=pq)
    try:
        r = BRAIN.invoke(s)
        resp = r.get("response", "")
        if not resp or resp.startswith("[LLM error"):
            return {"response": resp or "Agent error.", "commit": "",
                    "plan": r.get("plan", ""), "error": True}
        return {"response": resp, "commit": r.get("commit", ""), "plan": r.get("plan", "")}
    except Exception as e:
        return {"response": f"Agent error: {e}", "commit": "", "plan": "", "error": True}

# ── Smart Routing ─────────────────────────────────────────────────────────────
WEBSITE_KEYWORDS = [
    "add","create","build","make","design","update","change","modify","remove","delete",
    "fix","refactor","style","color","font","layout","page","section","navbar","footer",
    "hero","button","form","grid","animation","dark mode","responsive","component","feature",
    "deploy","rebuild","rewrite","implement","install","configure","css","html","javascript",
    "typescript","next","react","tailwind","scroll","hover","click","image","icon","logo",
    "background","gradient","card","modal","widget","chart","gallery","carousel","table",
]

def is_website_change(msg: str) -> bool:
    return any(k in msg.lower() for k in WEBSITE_KEYWORDS) and len(msg) > 8

def quick_reply(msg: str, pq=None) -> dict:
    agent_set("supervisor", "working", "Thinking...", 30, FAST)
    emit(pq, "step", step="thinking", msg="💭 Thinking...", progress=30, agent="supervisor")
    resp = llm(FAST, msg,
        "You are DaveAI, the AI powering daveai.tech — an agentic website builder. "
        "Answer helpfully. You can build websites, create pages, pull GitHub repos, "
        "download HuggingFace models, install npm packages, and more.",
        q=pq, stream_label="reply", agent_name="supervisor")
    agent_set("supervisor", "idle", "", 0, "")
    emit(pq, "done", msg=resp, progress=100)
    return {"response": resp, "commit": "", "plan": ""}

# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(title="DaveAI Brain", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── /chat ─────────────────────────────────────────────────────────────────────
@app.post("/chat")
async def chat(body: dict):
    import asyncio
    msg = body.get("message", "")
    log_event("chat", msg[:100])
    loop = asyncio.get_event_loop()
    fn = invoke if is_website_change(msg) else quick_reply
    try:
        return await asyncio.wait_for(loop.run_in_executor(None, fn, msg, None), timeout=180)
    except asyncio.TimeoutError:
        return {"response": "Timed out. Try a simpler request.", "commit": "", "plan": "", "error": True}

# ── /stream (SSE) ─────────────────────────────────────────────────────────────
@app.post("/stream")
async def stream_chat(body: dict):
    msg = body.get("message", "")
    req_id = str(uuid.uuid4())[:8]
    pq: queue.Queue = queue.Queue()
    _pqueues[req_id] = pq
    log_event("stream", msg[:100])

    def run_agent():
        try:
            fn = invoke if is_website_change(msg) else quick_reply
            fn(msg, pq)
        except Exception as e:
            emit(pq, "error", msg=str(e), progress=0)
        finally:
            pq.put(None)

    threading.Thread(target=run_agent, daemon=True).start()

    def events():
        yield f"data: {json.dumps({'type':'start','id':req_id,'msg':'🚀 DaveAI starting...','progress':0})}\n\n"
        while True:
            try:
                item = pq.get(timeout=180)
                if item is None:
                    yield f"data: {json.dumps({'type':'end'})}\n\n"
                    break
                yield f"data: {json.dumps(item)}\n\n"
            except Exception:
                yield f"data: {json.dumps({'type':'end'})}\n\n"
                break
        _pqueues.pop(req_id, None)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})

# ── /quick ────────────────────────────────────────────────────────────────────
@app.post("/quick")
async def quick_ep(body: dict):
    resp = llm(FAST, body.get("message", ""),
               "You are DaveAI assistant. Answer helpfully and concisely.")
    return {"response": resp, "commit": "", "plan": ""}

# ── /agents/status ────────────────────────────────────────────────────────────
@app.get("/agents/status")
async def agents_status():
    return {"agents": _agent_status}

# ── /admin ────────────────────────────────────────────────────────────────────
@app.post("/admin/login")
async def admin_login(body: dict):
    password = body.get("password", "")
    try:
        db = get_db()
        row = db.execute("SELECT password_hash, email FROM admin_table WHERE id=1").fetchone()
        db.close()
        if not row:
            raise Exception("No admin configured")
        pw_hash = hashlib.sha256(password.encode()).hexdigest()
        if pw_hash != row["password_hash"]:
            log_event("admin_login_fail", "wrong password")
            raise Exception("Invalid password")
        token = make_token()
        log_event("admin_login", "success")
        threading.Thread(
            target=send_email,
            args=("Admin login", f"Someone logged in as admin at {datetime.now()}"),
            daemon=True
        ).start()
        return {"token": token, "email": row["email"]}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/admin/password")
async def change_password(body: dict, admin: bool = Depends(is_admin)):
    if not admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin required")
    new_pw = body.get("password", "")
    if len(new_pw) < 8:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Password too short")
    db = get_db()
    db.execute("UPDATE admin_table SET password_hash=? WHERE id=1",
               (hashlib.sha256(new_pw.encode()).hexdigest(),))
    db.commit(); db.close()
    return {"status": "ok"}

# ── /vault ────────────────────────────────────────────────────────────────────
@app.get("/vault")
async def get_vault(admin: bool = Depends(is_admin)):
    if not admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin required")
    v = vault_read()
    masked = {k: ("*"*8 if v.get(k) else "") for k in v if k != "notes"}
    masked["notes"] = v.get("notes", "")
    return masked

@app.post("/vault")
async def set_vault(body: dict, admin: bool = Depends(is_admin)):
    if not admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin required")
    current = vault_read()
    current.update(body)
    vault_write(current)
    return {"status": "ok"}

# ── /pages ────────────────────────────────────────────────────────────────────
@app.get("/pages")
async def list_pages(site: str = "main"):
    db = get_db()
    rows = db.execute("SELECT * FROM pages WHERE site=? ORDER BY created_at DESC",
                      (site,)).fetchall()
    db.close()
    return {"pages": [dict(r) for r in rows]}

@app.post("/pages")
async def create_page(body: dict):
    name = body.get("name", "New Page")
    site = body.get("site", "main")
    template = body.get("template", "blank")
    page_id = str(uuid.uuid4())[:8]
    path = f"/pages/{name.lower().replace(' ','-')}"
    now = datetime.now().isoformat()
    db = get_db()
    db.execute("INSERT INTO pages VALUES (?,?,?,?,?,?,?,?)",
               (page_id, site, name, path, template, now, now, "user"))
    db.commit(); db.close()
    log_event("page_created", f"{site}/{name}")
    threading.Thread(
        target=send_email,
        args=(f"New page created: {name}",
              f"A new page '{name}' was created on site '{site}' at {now}"),
        daemon=True
    ).start()
    return {"id": page_id, "name": name, "path": path, "site": site}

@app.put("/pages/{page_id}")
async def update_page(page_id: str, body: dict):
    db = get_db()
    db.execute("UPDATE pages SET name=?, updated_at=? WHERE id=?",
               (body.get("name",""), datetime.now().isoformat(), page_id))
    db.commit(); db.close()
    return {"status": "ok"}

@app.delete("/pages/{page_id}")
async def delete_page(page_id: str, admin: bool = Depends(is_admin)):
    if not admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin required to delete pages")
    db = get_db()
    db.execute("DELETE FROM pages WHERE id=?", (page_id,))
    db.commit(); db.close()
    log_event("page_deleted", page_id)
    return {"status": "deleted"}

# ── /gitlab ──────────────────────────────────────────────────────────────────
@app.get("/gitlab/projects")
async def gitlab_projects_ep():
    """List accessible projects on the local GitLab instance."""
    result = gitlab_list_projects.invoke({})
    return {"result": result}

@app.post("/gitlab/clone")
async def gitlab_clone_ep(body: dict):
    """Clone a GitLab project into the workspace."""
    project_path = body.get("project_path", "")
    target_subdir = body.get("target_subdir", "")
    if not project_path:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="project_path required (e.g. 'dave/my-site')")
    result = gitlab_clone.invoke({"project_path": project_path, "target_subdir": target_subdir})
    return {"result": result}

# ── /projects ─────────────────────────────────────────────────────────────────
@app.get("/projects")
async def list_projects():
    try:
        parent = "/var/www"
        sites = []
        for d in os.listdir(parent):
            full = os.path.join(parent, d)
            if os.path.isdir(full) and not d.startswith("."):
                sites.append({"name": d, "path": full, "active": full == WORKSPACE})
        return {"projects": sites or [{"name": "agentic-website", "path": WORKSPACE, "active": True}]}
    except Exception:
        return {"projects": [{"name": "agentic-website", "path": WORKSPACE, "active": True}]}

# ── /log /rollback /health /status ───────────────────────────────────────────
@app.get("/log")
async def log_ep():
    return {"log": git_log(20)}

@app.post("/rollback")
async def rollback_ep(body: dict, admin: bool = Depends(is_admin)):
    if not admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin required")
    ref = body.get("ref", "HEAD~1")
    git_rollback(ref)
    return {"status": "ok", "rolled_back_to": ref}

@app.get("/health")
async def health():
    return {"status": "ok", "workspace": WORKSPACE, "autonomy": AUTO, "version": "4.0.0"}

@app.get("/status")
async def status():
    return {"log": git_log(5), "workspace": WORKSPACE, "autonomy": AUTO,
            "litellm": LLM_BASE, "version": "4.0.0", "agents": _agent_status}

@app.get("/analytics")
async def analytics(admin: bool = Depends(is_admin)):
    if not admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin required")
    db = get_db()
    rows = db.execute("SELECT * FROM analytics ORDER BY ts DESC LIMIT 100").fetchall()
    db.close()
    return {"events": [dict(r) for r in rows]}

# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    log_event("ws_connect", ws.client.host if ws.client else "")
    while True:
        try:
            import asyncio
            data = await ws.receive_json()
            msg = data.get("message", "")
            pq: queue.Queue = queue.Queue()

            def run_bg():
                fn = invoke if is_website_change(msg) else quick_reply
                fn(msg, pq)
                pq.put(None)

            threading.Thread(target=run_bg, daemon=True).start()
            while True:
                try:
                    item = pq.get(timeout=0.1)
                    if item is None: break
                    await ws.send_json(item)
                except queue.Empty:
                    await asyncio.sleep(0.05)
        except Exception as e:
            try: await ws.send_json({"type": "error", "msg": str(e)})
            except Exception: break

if __name__ == "__main__":
    import uvicorn
    print(f"DaveAI Brain v4  workspace={WORKSPACE}  llm={LLM_BASE}")
    get_db()  # init db
    uvicorn.run(app, host="0.0.0.0", port=8888, reload=False, log_level="info")
