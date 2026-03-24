"""brain_openhands.py — OpenHands HTTP client for DaveAI agent pipeline.

Sends complex multi-file coding tasks to the OpenHands Docker agent and
streams progress back to the LangGraph execute_node.

Triple failsafe:
    1. OpenHands Docker API  — full AI code agent (primary)
    2. ZeroClaw shell exec   — direct shell fallback
    3. Structured plan only  — return step-by-step plan, no execution

Architecture:
    execute_node() → should_use_openhands() → openhands_execute() (generator)
                                          ↘ zeroclaw_shell() (fallback)
                                          ↘ return_plan() (last resort)

Usage:
    from brain_openhands import openhands_health, should_use_openhands, openhands_execute

    if should_use_openhands(task):
        for event in openhands_execute(task):
            print(event)
"""

import json
import os
import time
import urllib.request
import urllib.error
from typing import Generator, Optional

# ── Config ────────────────────────────────────────────────────────────────────
_OH_URL        = os.getenv("OPENHANDS_URL", "http://localhost:3333")
_ZC_URL        = os.getenv("ZEROCLAW_URL",  "http://localhost:3000")
_WORKSPACE     = os.getenv("WORKSPACE",     "/var/www/agentic-website")
_POLL_INTERVAL = 3       # seconds between OpenHands event polls
_MAX_POLLS     = 200     # max ~10 minutes total
_TIMEOUT       = 15      # HTTP request timeout (seconds)

_oh_health_cache: dict = {"ok": False, "ts": 0.0}
_OH_HEALTH_TTL = 30.0  # seconds


# ── Health check ──────────────────────────────────────────────────────────────
def openhands_health() -> dict:
    """Check if OpenHands is reachable. Returns {ok: bool}. Result cached for 30s."""
    now = time.monotonic()
    if now - _oh_health_cache["ts"] < _OH_HEALTH_TTL:
        return {"ok": _oh_health_cache["ok"]}
    try:
        req = urllib.request.Request(
            f"{_OH_URL}/api/options/config",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            resp.read()
            result = True
    except Exception:
        result = False
    _oh_health_cache.update({"ok": result, "ts": now})
    return {"ok": result}


# ── Decision logic ────────────────────────────────────────────────────────────
def should_use_openhands(task: dict) -> bool:
    """
    Decide if a task is complex enough to route through OpenHands.

    Use OpenHands when:
      - Task touches >= 3 files
      - Task type is 'refactor' or 'multi_file'
      - Task description contains keywords like 'migrate', 'scaffold', 'integrate'
      - Estimated lines > 200
    """
    if not openhands_health()["ok"]:
        return False

    desc = (task.get("description") or task.get("action") or "").lower()
    typ  = task.get("type", "")
    files = task.get("files", [])
    lines = task.get("estimated_lines", 0)

    complex_keywords = {"migrate", "scaffold", "integrate", "refactor",
                        "restructure", "convert", "multi_file", "full_page"}

    return (
        typ in ("refactor", "multi_file")
        or len(files) >= 3
        or lines > 200
        or any(kw in desc for kw in complex_keywords)
    )


# ── Main executor ─────────────────────────────────────────────────────────────
def openhands_execute(task: dict) -> Generator[str, None, None]:
    """
    Execute a task via OpenHands with triple failsafe.

    Yields SSE-style progress strings:
        "PROGRESS: <message>"
        "DIFF: <unified diff>"
        "DONE: <summary>"
        "FALLBACK: <message>"
        "PLAN: <step>"
        "ERROR: <message>"
    """
    # ── Failsafe 1: OpenHands Docker API ────────────────────────────────────
    try:
        yield from _openhands_api_execute(task)
        return
    except Exception as e:
        yield f"FALLBACK: OpenHands API failed ({e}), trying ZeroClaw shell"

    # ── Failsafe 2: ZeroClaw shell ───────────────────────────────────────────
    try:
        yield from _zeroclaw_shell_execute(task)
        return
    except Exception as e:
        yield f"FALLBACK: ZeroClaw shell failed ({e}), returning structured plan"

    # ── Failsafe 3: Structured plan only ────────────────────────────────────
    yield from _return_structured_plan(task)


# ── Failsafe 1: OpenHands API ─────────────────────────────────────────────────
def _openhands_api_execute(task: dict) -> Generator[str, None, None]:
    """Create an OpenHands conversation and poll until completion."""
    # Build the task prompt
    prompt = _build_task_prompt(task)

    # Create conversation
    conv_id = _oh_create_conversation(prompt)
    yield f"PROGRESS: OpenHands conversation created (id={conv_id})"

    # Poll for events
    last_event_id = 0
    polls = 0
    final_state = None

    while polls < _MAX_POLLS:
        time.sleep(_POLL_INTERVAL)
        polls += 1

        events = _oh_get_events(conv_id, start_id=last_event_id)
        for event in events:
            eid  = event.get("id", 0)
            etype = event.get("type", "")
            data  = event.get("data", {})

            if eid > last_event_id:
                last_event_id = eid

            if etype == "agent.status_update":
                status = data.get("status", "")
                yield f"PROGRESS: [{polls}/{_MAX_POLLS}] {status}"

                if status in ("done", "error", "rejected"):
                    final_state = status
                    break

            elif etype == "file.patch":
                diff = data.get("patch", "")
                if diff:
                    yield f"DIFF: {diff[:2000]}"

            elif etype == "agent.message":
                msg = data.get("content", "")
                if msg:
                    yield f"PROGRESS: {msg[:500]}"

        if final_state:
            break

    # Get final summary
    summary = _oh_get_summary(conv_id)
    if final_state == "done":
        yield f"DONE: {summary}"
    else:
        raise RuntimeError(f"OpenHands ended with state={final_state}: {summary}")


def _oh_create_conversation(prompt: str) -> str:
    """Create a new OpenHands conversation. Returns conversation ID."""
    payload = json.dumps({
        "message": prompt,
        "workspace_dir": _WORKSPACE,
    }).encode()

    req = urllib.request.Request(
        f"{_OH_URL}/api/conversations",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read())
        return data["conversation_id"]


def _oh_get_events(conv_id: str, start_id: int = 0) -> list:
    """Fetch events from an OpenHands conversation."""
    url = f"{_OH_URL}/api/conversations/{conv_id}/events?start_id={start_id}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read())
        return data.get("events", [])


def _oh_get_summary(conv_id: str) -> str:
    """Get the final summary of an OpenHands conversation."""
    try:
        url = f"{_OH_URL}/api/conversations/{conv_id}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read())
            return data.get("summary", "Task complete")
    except Exception:
        return "Task complete (summary unavailable)"


# ── Failsafe 2: ZeroClaw shell ────────────────────────────────────────────────
def _zeroclaw_shell_execute(task: dict) -> Generator[str, None, None]:
    """Execute task via ZeroClaw's shell execution endpoint."""
    cmd = _build_shell_command(task)
    yield f"PROGRESS: Executing via ZeroClaw shell: {cmd[:100]}"

    payload = json.dumps({"command": cmd, "cwd": _WORKSPACE}).encode()
    req = urllib.request.Request(
        f"{_ZC_URL}/api/execute",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
        output = data.get("output", "")
        exit_code = data.get("exit_code", 0)

        if exit_code != 0:
            raise RuntimeError(f"Shell exit code {exit_code}: {output[:500]}")

        yield f"DONE: ZeroClaw shell execution complete:\n{output[:1000]}"


# ── Failsafe 3: Structured plan ───────────────────────────────────────────────
def _return_structured_plan(task: dict) -> Generator[str, None, None]:
    """Return a step-by-step plan when execution backends are unavailable."""
    yield "FALLBACK: All execution backends unavailable. Returning structured plan."

    description = task.get("description") or task.get("action") or "unknown task"
    files = task.get("files", [])

    yield f"PLAN: Task: {description}"
    yield f"PLAN: Files to modify: {', '.join(files) or 'unspecified'}"
    yield  "PLAN: Step 1 — Review existing code in target files"
    yield  "PLAN: Step 2 — Create/update each file with required changes"
    yield  "PLAN: Step 3 — Run tests and verify output"
    yield  "PLAN: Step 4 — Commit changes with descriptive message"
    yield  "DONE: Structured plan delivered (manual execution required)"


# ── Helpers ───────────────────────────────────────────────────────────────────
def _build_task_prompt(task: dict) -> str:
    """Build a clear OpenHands task prompt from a task dict."""
    parts = ["You are working in a Next.js 15 + TypeScript codebase.\n"]
    parts.append(f"## Task\n{task.get('description') or task.get('action', '')}\n")

    if task.get("files"):
        parts.append(f"## Files to modify\n{chr(10).join(task['files'])}\n")

    if task.get("constraints"):
        parts.append(f"## Constraints\n{task['constraints']}\n")

    parts.append(
        "## Rules\n"
        "- Max 400 lines per file. Split into _p1.py / _p2.py if needed.\n"
        "- Write TypeScript, not JavaScript.\n"
        "- Use existing project conventions.\n"
        "- Run lint after writing (npm run lint).\n"
        "- Commit with: git commit -m 'feat: <description>'\n"
    )
    return "".join(parts)


def _build_shell_command(task: dict) -> str:
    """Build a shell command for ZeroClaw execution fallback."""
    action = task.get("action", "")
    files  = task.get("files", [])

    if "install" in action.lower():
        pkg = task.get("package", "")
        return f"npm install {pkg} --save"
    elif "build" in action.lower():
        return "npm run build 2>&1"
    elif "lint" in action.lower():
        return "npm run lint 2>&1"
    elif "test" in action.lower():
        return "npm test -- --watchAll=false 2>&1"
    else:
        return f"echo 'Task: {action}' && ls -la {' '.join(files)}"
