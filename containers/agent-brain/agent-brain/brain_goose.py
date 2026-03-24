"""
brain_goose.py — Alice's Goose coding agent integration
Goose v1.27.2 (block/goose) — local agentic shell executor.

Goose runs as a subprocess:  goose run --text "..." --no-session --quiet
Alice uses Goose for:
  - Fast single-file code changes (< 3 files)
  - Shell command execution & scripting
  - Quick refactors (< 100 lines)
  - README / doc updates
  - JS/CSS/HTML tweaks

Alice uses OpenHands for:
  - Complex multi-file refactors (3+ files, 200+ lines)
  - Scaffold new features
  - Migrations
  - Long-running tasks (> 60s)
"""
import subprocess, tempfile, os, json, time, logging
from pathlib import Path

_LOG = logging.getLogger("brain_goose")

# Goose binary locations to try
_GOOSE_BINS = [
    "/usr/local/bin/goose",
    "/root/.local/bin/goose",
    "/opt/goose/bin/goose",
]

_WORKSPACE = "/var/www/agentic-website"
_TIMEOUT   = 90  # seconds


def goose_health() -> dict:
    """Check if Goose binary is available."""
    for p in _GOOSE_BINS:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            try:
                r = subprocess.run([p, "--version"], capture_output=True, text=True, timeout=5)
                ver = (r.stdout + r.stderr).strip().split('\n')[0]
                return {"ok": True, "path": p, "version": ver}
            except Exception:
                pass
    return {"ok": False, "path": None, "version": None}


def _find_goose() -> str | None:
    h = goose_health()
    return h["path"] if h["ok"] else None


def should_use_goose(task: str) -> bool:
    """
    Route to Goose for fast, targeted tasks.
    Alice prefers Goose when task is quick/single-file.
    """
    task_l = task.lower()
    goose_signals = [
        "edit file", "create file", "fix bug", "add function", "update style",
        "change color", "rename", "add comment", "fix typo", "quick fix",
        "small change", "tweak", "add line", "delete line", "patch",
        "update js", "update css", "update html", "modify",
        "run command", "run script", "execute", "shell",
    ]
    openhands_signals = [
        "refactor", "scaffold", "multi-file", "migrate", "entire", "complete rewrite",
        "new feature end-to-end", "test suite", "restructure",
    ]
    for s in openhands_signals:
        if s in task_l:
            return False
    goose_score = sum(1 for s in goose_signals if s in task_l)
    return goose_score >= 1


def goose_execute(task: str, pq=None):
    """
    Execute a task with Goose. Yields SSE-compatible strings.
    Falls back gracefully if Goose unavailable.
    """
    goose_bin = _find_goose()
    if not goose_bin:
        yield "FALLBACK: Goose binary not found. Routing to OpenHands."
        return

    try:
        yield f"PROGRESS: Goose is working on: {task[:100]}"

        cmd = [
            goose_bin, "run",
            "--text", task,
            "--no-session",
            "--quiet",
        ]

        # LiteLLM provider env — openai-compatible at localhost:4000
        goose_env = {
            **os.environ,
            "GOOSE_WORKSPACE": _WORKSPACE,
            "GOOSE_PROVIDER": "litellm",
            "GOOSE_MODEL": "fast-agent",
        }

        _LOG.info(f"Running Goose: {' '.join(cmd[:3])}...")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT,
            cwd=_WORKSPACE,
            env=goose_env,
        )

        output = (result.stdout or "").strip()
        errors = (result.stderr or "").strip()

        if result.returncode == 0:
            # Parse output for diffs/changes
            if output:
                # Look for file change indicators in output
                lines = output.split('\n')
                diff_lines = [l for l in lines if l.startswith(('+', '-', 'Modified:', 'Created:', 'Wrote:'))]
                if diff_lines:
                    diff_summary = '\n'.join(diff_lines[:20])
                    yield f"DIFF: {diff_summary}"

                summary = lines[-1] if lines else "Task complete"
                yield f"DONE: {summary}"
            else:
                yield "DONE: Goose completed the task (no output)"
        else:
            _LOG.warning(f"Goose exited {result.returncode}: {errors[:200]}")
            if errors:
                yield f"ERROR: Goose failed: {errors[:300]}"
            else:
                yield f"ERROR: Goose exited with code {result.returncode}"

    except subprocess.TimeoutExpired:
        yield f"ERROR: Goose timed out after {_TIMEOUT}s. Try a smaller task."
    except Exception as e:
        yield f"ERROR: Goose exception: {str(e)[:200]}"


def goose_run_sync(task: str) -> dict:
    """Synchronous Goose execution — returns dict with success/output."""
    goose_bin = _find_goose()
    if not goose_bin:
        return {"success": False, "output": "Goose not installed", "error": "binary not found"}

    try:
        result = subprocess.run(
            [goose_bin, "run", "--text", task, "--no-session", "--quiet"],
            env={**os.environ,
                 "GOOSE_PROVIDER": "litellm", "GOOSE_MODEL": "fast-agent",
                 },
            capture_output=True, text=True, timeout=_TIMEOUT,
            cwd=_WORKSPACE,
            env={**os.environ, "GOOSE_WORKSPACE": _WORKSPACE},
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout.strip(),
            "error": result.stderr.strip() if result.returncode != 0 else "",
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "output": "", "error": f"Timeout after {_TIMEOUT}s"}
    except Exception as e:
        return {"success": False, "output": "", "error": str(e)}
