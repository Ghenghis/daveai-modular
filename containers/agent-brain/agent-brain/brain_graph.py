"""brain_graph.py — LangGraph 6-node pipeline with ReAct exec, JSON planning, asset agent."""
import json, os, re, subprocess, threading, time
from datetime import datetime
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from brain_core import WORKSPACE, HEAVY, FAST, AUTO, is_destructive
from brain_events import agent_set, emit, agent_reset_all
from brain_llm import llm, llm_json, llm_fast, llm_heavy
from brain_skills import run_tool, tools_manifest, ALL_SKILLS
from brain_memory import build_context, learn_from_build, recall_workspace
from brain_db import log_event, log_build
from brain_tools import git_commit, shell_run, file_write
from brain_checkpoint import checkpoint_save, checkpoint_complete, checkpoint_fail

# ── Circuit Breaker & Budget Constants ─────────────────────────────────────────
_CB = {
    "max_task_tokens":        50_000,   # Hard token cap per full task (input+output)
    "max_wall_clock_seconds": 600,      # 10 min hard wall-clock limit per invoke()
    "max_file_changes":       25,       # Stop if agent writes >25 files in one run
    "max_consecutive_errors": 3,        # 3 tool errors in a row → abort _react loop
    "max_qa_fix_attempts":    3,        # Max QA auto-fix cycles before aborting
    "max_react_steps":        12,       # Max ReAct steps per task
}

class _Budget:
    """Per-invocation token + file + error counter with wall-clock guard."""
    def __init__(self):
        self.tokens_used   = 0
        self.files_written = 0
        self.consec_errors = 0
        self.start_ts      = time.monotonic()

    def add_tokens(self, n: int):
        self.tokens_used += n

    def tick_file(self):
        self.files_written += 1

    def tick_error(self):
        self.consec_errors += 1

    def clear_errors(self):
        self.consec_errors = 0

    def elapsed(self) -> float:
        return time.monotonic() - self.start_ts

    def check(self) -> Optional[str]:
        """Return a breaker reason string if any limit is exceeded, else None."""
        if self.tokens_used >= _CB["max_task_tokens"]:
            return f"token_budget_exceeded:{self.tokens_used}"
        if self.elapsed() >= _CB["max_wall_clock_seconds"]:
            return f"wall_clock_exceeded:{self.elapsed():.0f}s"
        if self.files_written >= _CB["max_file_changes"]:
            return f"file_change_limit:{self.files_written}"
        if self.consec_errors >= _CB["max_consecutive_errors"]:
            return f"consecutive_errors:{self.consec_errors}"
        return None

# Thread-local budget so concurrent requests don't share state
import threading as _threading
_tl = _threading.local()

def _get_budget() -> _Budget:
    if not hasattr(_tl, "budget"):
        _tl.budget = _Budget()
    return _tl.budget

def _new_budget() -> _Budget:
    _tl.budget = _Budget()
    return _tl.budget

# ── State schema (expanded v2) ─────────────────────────────────────────────────
class State(TypedDict):
    request:      str
    plan:         str
    plan_json:    dict           # structured JSON plan from supervisor
    tasks:        List[str]
    task_types:   List[str]      # "code" | "asset" | "shell" | "config"
    results:      List[str]
    asset_results: List[str]
    qa_errors:    List[str]
    fix_attempts: int
    commit:       str
    needs_ok:     bool
    approved:     bool
    response:     str
    memory_ctx:   str
    cp_id:        str           # active checkpoint id ('' if none)
    span_id:      str
    start_ts:     float
    pq:           object

# ── Prompts ────────────────────────────────────────────────────────────────────
_SUPER_SYS = f"""You are the Supervisor Agent for daveai.tech (workspace: {WORKSPACE}).
Output ONLY valid JSON with this schema:
{{"needs_approval": false, "tasks": [
  {{"id":1,"type":"code","title":"...","detail":"...","agent":"coder"}},
  {{"id":2,"type":"asset","title":"...","detail":"...","agent":"asset"}}
]}}
Types: code=write/edit files, asset=images/icons/styles, shell=commands, config=env/deps.
needs_approval=true only for: wipe-site, delete-all, switch-framework."""

_CODER_SYS = f"""You are the Coder Agent for {WORKSPACE}.

KEY TOOLS (use these):
- file_write: Create/overwrite a file. Args: {{{{"path": "filename.html", "content": "full html here"}}}}
- file_read: Read a file. Args: {{{{"path": "filename"}}}}
- shell_run: Run a shell command. Args: {{{{"command": "ls -la"}}}}
- directory_list: List files. Args: {{{{"path": "."}}}}

All available tools:
{{tools}}

Previous context:
{{context}}

IMPORTANT RULES:
- To create a NEW file, ALWAYS use file_write with path and content.
- Action args MUST be valid JSON with correct field names.
- Keep file content SHORT and complete. Do NOT truncate code.

Respond with ONE of:
THOUGHT: <your reasoning>
ACTION: tool_name | {{{{"key": "value"}}}}
or when done:
FINAL: <summary of what was done>"""

_ASSET_SYS = f"""You are the Asset Agent for {WORKSPACE}.
Handle images, icons, color palettes, fonts, and static assets.
Available tools:
{{tools}}
Respond with ACTION: <tool_name> | <json args> or FINAL: <summary>"""

# ── ReAct execution engine ─────────────────────────────────────────────────────
def _react(task: str, role: str, q, span_id: str,
           max_steps: int = _CB["max_react_steps"]) -> list[str]:
    """Reason-Act-Observe loop for one task. Returns list of result strings.
    Respects global _Budget circuit breaker — aborts early on limit breach."""
    budget = _get_budget()
    tools_str = tools_manifest(role, 20)
    history: list[str] = []
    results: list[str] = []

    for step in range(max_steps):
        # ── Circuit breaker check ──────────────────────────────────────────────
        breaker = budget.check()
        if breaker:
            reason = breaker.split(":")[0]
            log_event("circuit_breaker", f"role={role} reason={breaker} step={step}")
            emit(q, "step", agent=role, phase="execute",
                 msg=f"⚠️ Circuit breaker: {reason}. Stopping safely.",
                 progress=80, span_id=span_id)
            results.append(f"[circuit_breaker] Stopped: {breaker}")
            break

        hist = "\n".join(history[-8:])
        sys_prompt = (_CODER_SYS if role == "coder" else _ASSET_SYS).format(
            tools=tools_str, context=hist)
        prompt = f"Task: {task}\n\nHistory:\n{hist}" if hist else f"Task: {task}"
        response = llm(HEAVY if role == "coder" else FAST, prompt, sys_prompt,
                       q=q, stream_label=role, agent_name=role, timeout=300)

        # Rough token estimation (4 chars ≈ 1 token)
        budget.add_tokens((len(prompt) + len(response)) // 4)

        if "FINAL:" in response:
            final = response.split("FINAL:")[-1].strip()
            results.append(final)
            budget.clear_errors()
            break

        if "ACTION:" in response:
            action_line = response.split("ACTION:")[-1].split("\n")[0].strip()
            tool_name, _, args_str = action_line.partition("|")
            tool_name = tool_name.strip()
            try:
                args = json.loads(args_str.strip()) if args_str.strip() else {}
            except Exception:
                args = {"command": args_str.strip()} if args_str.strip() else {}

            r = run_tool(tool_name, args, role)
            obs = r["result"][:400]
            ok = r.get("ok", True)
            history.append(f"ACTION: {tool_name}({args_str[:60]})")
            if ok:
                budget.clear_errors()
                history.append(f"OBSERVATION: {obs}")
                results.append(f"[{tool_name}] {obs[:120]}")
                # Track file writes for file-change circuit breaker
                if tool_name in ("file_write", "file_patch", "file_append"):
                    budget.tick_file()
            else:
                budget.tick_error()
                history.append(f"ERROR: {obs}")
                history.append("Fix: Check tool name and args format. Use file_write for new files.")
            emit(q, "action", agent=role, phase="execute",
                 msg=f"⚙ {tool_name}: {obs[:80]}", progress=50, span_id=span_id)

        if "THOUGHT:" in response:
            thought = response.split("THOUGHT:")[-1].split("ACTION:")[0].strip()[:120]
            history.append(f"THOUGHT: {thought}")

    return results or [f"Completed: {task[:80]}"]


# ── Nodes ──────────────────────────────────────────────────────────────────────
def supervisor_node(state: State) -> State:
    q, sid = state.get("pq"), state.get("span_id", "")
    agent_set("supervisor", "running", "Planning...", 8, HEAVY)
    emit(q, "step", agent="supervisor", phase="plan",
         msg="🧠 Supervisor: Analyzing...", progress=8, span_id=sid)

    mem_ctx = build_context("supervisor", state["request"])
    plan_data = llm_json(HEAVY,
        f"Memory context:\n{mem_ctx}\n\nRequest: {state['request']}",
        _SUPER_SYS, agent_name="supervisor")

    tasks_raw = plan_data.get("tasks", [])
    if not tasks_raw:
        tasks_raw = [{"type": "code", "title": state["request"],
                      "detail": state["request"], "agent": "coder"}]

    tasks      = [t.get("detail", t.get("title", "")) for t in tasks_raw]
    task_types = [t.get("type", "code") for t in tasks_raw]
    needs_ok   = plan_data.get("needs_approval", False) or is_destructive(state["request"])
    plan_str   = json.dumps(plan_data, indent=2)

    agent_set("supervisor", "done", f"{len(tasks)} tasks", 100, HEAVY)
    emit(q, "step", agent="supervisor", phase="plan",
         msg=f"📋 Plan: {len(tasks)} tasks", progress=20,
         plan=plan_str, span_id=sid)

    _cp_id = checkpoint_save(sid, "supervisor", state["request"],
                             plan_data, tasks, [],
                             tokens_used=_get_budget().tokens_used)
    return {**state, "plan": plan_str, "plan_json": plan_data,
            "tasks": tasks, "task_types": task_types,
            "needs_ok": needs_ok, "memory_ctx": mem_ctx, "cp_id": _cp_id}


def check_approval(state: State) -> str:
    return "approve" if state["needs_ok"] else "execute"


def approve_node(state: State) -> State:
    return {**state, "approved": True}


def after_approve(state: State) -> str:
    return "execute" if state["approved"] else "done"


def execute_node(state: State) -> State:
    q, sid = state.get("pq"), state.get("span_id", "")
    results: list[str] = []
    asset_results: list[str] = []
    tasks      = state["tasks"]
    task_types = state.get("task_types", ["code"] * len(tasks))

    for i, (task, ttype) in enumerate(zip(tasks, task_types)):
        pct = 25 + int((i / max(len(tasks), 1)) * 55)
        short = task[:70]
        role  = "asset" if ttype == "asset" else "coder"

        agent_set(role, "running", short, pct, HEAVY)
        emit(q, "step", agent=role, phase="execute",
             msg=f"⚙️ {role.title()} [{i+1}/{len(tasks)}]: {short}",
             progress=pct, span_id=sid)

        step_results = _react(task, role, q, sid)
        if role == "asset":
            asset_results.extend(step_results)
        else:
            results.extend(step_results)

    agent_set("coder", "done", "Tasks complete", 100, HEAVY)
    emit(q, "step", agent="coder", phase="commit",
         msg="📦 Committing to Git...", progress=85, span_id=sid)

    commit_msg = (f"agent: {state['request'][:55].strip()} "
                  f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}]")
    git_commit(commit_msg)
    emit(q, "step", agent="coder", phase="commit",
         msg="✅ Committed!", progress=92, span_id=sid)

    budget = _get_budget()
    checkpoint_save(state.get("cp_id", sid) or sid, "execute",
                    state["request"], state.get("plan_json", {}),
                    tasks, results,
                    tokens_used=budget.tokens_used,
                    files_written=budget.files_written)
    return {**state, "results": results, "asset_results": asset_results,
            "commit": commit_msg, "qa_errors": [], "fix_attempts": 0}


def qa_node(state: State) -> State:
    q, sid = state.get("pq"), state.get("span_id", "")
    agent_set("qa", "running", "Checking...", 50, "")
    emit(q, "step", agent="qa", phase="qa",
         msg="🔍 QA: Running checks...", progress=95, span_id=sid)

    errors: list[str] = []
    r = subprocess.run(
        "npx tsc --noEmit 2>&1 | head -20 || true",
        shell=True, cwd=WORKSPACE, capture_output=True, text=True, timeout=45)
    if "error TS" in r.stdout:
        errors.append(f"TS errors:\n{r.stdout[:400]}")

    r2 = subprocess.run(
        "npx eslint . --ext .ts,.tsx --max-warnings 0 2>&1 | tail -10 || true",
        shell=True, cwd=WORKSPACE, capture_output=True, text=True, timeout=30)
    eslint_errors = re.search(r"(\d+) error", r2.stdout)
    if eslint_errors and int(eslint_errors.group(1)) > 0:
        errors.append(f"ESLint: {r2.stdout[:200]}")

    agent_set("qa", "done" if not errors else "error",
              f"{len(errors)} issues", 100, "")
    emit(q, "step", agent="qa", phase="qa",
         msg=f"🔍 QA: {'✅ Clean' if not errors else f'⚠️ {len(errors)} issues'}",
         progress=96, span_id=sid)
    return {**state, "qa_errors": errors}


def should_fix(state: State) -> str:
    if (state.get("qa_errors") and
            state.get("fix_attempts", 0) < _CB["max_qa_fix_attempts"]):
        return "fix"
    return "done"


def fix_node(state: State) -> State:
    q, sid = state.get("pq"), state.get("span_id", "")
    attempts = state.get("fix_attempts", 0) + 1
    errors = "\n".join(state.get("qa_errors", []))
    agent_set("coder", "running", f"Auto-fix attempt {attempts}", 50, HEAVY)
    emit(q, "step", agent="coder", phase="fix",
         msg=f"🔧 Auto-fixing QA errors (attempt {attempts})...",
         progress=93, span_id=sid)

    fix_results = _react(
        f"Fix these errors in the codebase:\n{errors}",
        "coder", q, sid, max_steps=4)

    new_results = state["results"] + [f"[fix] {r}" for r in fix_results]
    return {**state, "results": new_results, "fix_attempts": attempts}


def done_node(state: State) -> State:
    q, sid = state.get("pq"), state.get("span_id", "")
    duration = round(time.monotonic() - state.get("start_ts", time.monotonic()), 1)
    all_results = state.get("results", []) + state.get("asset_results", [])
    success = bool(state.get("commit")) and not state.get("qa_errors")

    if all_results:
        agent_set("supervisor", "running", "Summarizing...", 97, FAST)
        emit(q, "step", agent="supervisor", phase="done",
             msg="✍️ Writing summary...", progress=97, span_id=sid)
        summary = llm_fast(
            "2-sentence summary of website changes:\n" +
            "\n".join(str(r) for r in all_results[:5]),
            agent_name="supervisor")
        resp = f"{summary}\n\n✅ Committed: `{state.get('commit','')}`"
    else:
        resp = "Acknowledged — no file changes made."

    log_event("build_complete", state["request"][:100])
    log_build(state["request"], state.get("plan",""), all_results,
              state.get("commit",""), duration, "ok" if success else "warn")
    learn_from_build("supervisor", state["request"], resp, success)

    # ── Checkpoint lifecycle close ─────────────────────────────────────────────
    _cp_id = state.get("cp_id", "")
    if _cp_id:
        if success:
            checkpoint_complete(_cp_id)
        else:
            checkpoint_fail(_cp_id)

    # ── Discover HTML files written in this commit and register in pages DB ────
    import subprocess as _sp
    created_files: list[str] = []
    preview_url: str = ""
    commit_msg = state.get("commit", "")
    if commit_msg:
        try:
            # Resolve the actual git SHA for the most recent commit (state["commit"]
            # holds the commit *message* string, not a hash).
            sha_result = _sp.run(
                ["git", "log", "-1", "--format=%H"],
                capture_output=True, text=True, cwd=WORKSPACE, timeout=10
            )
            actual_sha = sha_result.stdout.strip()
            if actual_sha:
                result = _sp.run(
                    ["git", "show", "--name-only", "--format=", actual_sha],
                    capture_output=True, text=True, cwd=WORKSPACE, timeout=10
                )
                # Filter to .html files, exclude hidden files
                changed = [f.strip() for f in result.stdout.strip().splitlines() if f.strip() and not f.startswith(".")]
                html_files = [f for f in changed if f.lower().endswith(".html")]
                # Register each HTML file in the pages DB
                for filepath in html_files:
                    try:
                        name_part = os.path.splitext(os.path.basename(filepath))[0]
                        page_name = name_part.replace("-", " ").replace("_", " ").title()
                        page_path = f"/{filepath}"  # e.g. "/hello.html" or "/pages/contact.html"
                        from brain_db import page_create
                        page_create(name=page_name, site="main", path=page_path, template="custom", created_by="agent")
                    except Exception:
                        pass  # Already exists or DB error — non-fatal
                if html_files:
                    created_files = html_files
                    # Use the first HTML file as the preview URL
                    preview_url = f"https://daveai.tech/{html_files[0]}"
        except Exception:
            pass  # Non-fatal — commit info not available

    agent_reset_all()
    emit(q, "done", agent="supervisor", phase="done",
         msg=resp, progress=100, span_id=sid,
         commit=state.get("commit", ""), plan=state.get("plan", ""),
         created_files=created_files, preview_url=preview_url)
    return {**state, "response": resp}


# ── Compile graph ──────────────────────────────────────────────────────────────
def build_graph():
    g = StateGraph(State)
    g.add_node("supervisor", supervisor_node)
    g.add_node("approve",    approve_node)
    g.add_node("execute",    execute_node)
    g.add_node("qa",         qa_node)
    g.add_node("fix",        fix_node)
    g.add_node("done",       done_node)
    g.set_entry_point("supervisor")
    g.add_conditional_edges("supervisor", check_approval,
                            {"approve": "approve", "execute": "execute"})
    g.add_conditional_edges("approve", after_approve,
                            {"execute": "execute", "done": "done"})
    g.add_edge("execute", "qa")
    g.add_conditional_edges("qa", should_fix, {"fix": "fix", "done": "done"})
    g.add_edge("fix", "qa")
    g.add_edge("done", END)
    return g.compile()

BRAIN = build_graph()


# ── Public invoke + quick reply ────────────────────────────────────────────────
def invoke(msg: str, pq=None) -> dict:
    import uuid as _uuid, logging, traceback
    sid = _uuid.uuid4().hex[:8]
    budget = _new_budget()   # fresh circuit breaker for this invocation
    s = State(
        request=msg, plan="", plan_json={}, tasks=[], task_types=[],
        results=[], asset_results=[], qa_errors=[], fix_attempts=0,
        commit="", needs_ok=False, approved=False, response="",
        memory_ctx="", cp_id="", span_id=sid, start_ts=time.monotonic(), pq=pq)
    try:
        logging.getLogger("invoke").info(f"BRAIN.invoke starting: {msg[:80]}")
        r = BRAIN.invoke(s)
        tok = budget.tokens_used
        logging.getLogger("invoke").info(
            f"BRAIN.invoke done: resp={str(r.get('response',''))[:80]} "
            f"tokens≈{tok} files={budget.files_written} t={budget.elapsed():.1f}s")
        log_event("invoke_complete",
                  f"tokens≈{tok} files={budget.files_written} t={budget.elapsed():.1f}s")
        return {"response": r.get("response", "Agent error."),
                "commit": r.get("commit", ""), "plan": r.get("plan", ""),
                "tokens_used": tok}
    except Exception as e:
        logging.getLogger("invoke").error(f"BRAIN.invoke FAILED: {e}\n{traceback.format_exc()}")
        emit(pq, "error", msg=f"Agent error: {e}", progress=0)
        log_event("invoke_error", str(e)[:200])
        return {"response": f"Agent error: {e}", "commit": "", "plan": "", "error": True}


def quick_reply(msg: str, pq=None) -> dict:
    """Alice is DaveAI's primary voice. All conversational queries go through her."""
    from brain_alice import alice_quick_reply
    return alice_quick_reply(msg, pq)