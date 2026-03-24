"""brain_memory.py — agent memory: persistent context, build history, recall injection."""
from datetime import datetime
from brain_db import mem_set, mem_get, mem_search, recent_builds, log_event


# ── Store helpers ──────────────────────────────────────────────────────────────
def remember(agent: str, key: str, value: str):
    """Persist a key-value fact for an agent."""
    mem_set(agent, key, value)


def recall(agent: str, key: str) -> str:
    """Retrieve a specific stored fact."""
    return mem_get(agent, key)


def recall_relevant(agent: str, query: str, limit: int = 4) -> list[dict]:
    """Keyword search over agent's memory — returns top matching entries."""
    return mem_search(agent, query, limit)


# ── Context injection for LLM prompts ─────────────────────────────────────────
def build_context(agent: str, request: str) -> str:
    """
    Produce a compact memory context string to prepend to LLM prompts.
    Includes relevant past memory + last 3 build outcomes.
    """
    lines = []

    # Recent relevant memories
    hits = recall_relevant(agent, request, limit=4)
    if hits:
        lines.append("## Agent Memory (relevant context)")
        for h in hits:
            lines.append(f"- [{h['key']}] {h['value'][:150]}")

    # Recent builds from global build log
    builds = recent_builds(3)
    if builds:
        lines.append("## Recent Builds")
        for b in builds:
            status_icon = "✅" if b.get("status", "") == "ok" else "❌"
            req = b.get("request", "")[:60]
            dur = b.get("duration_s", 0) or 0
            sha = b.get("commit_sha", "")[:8]
            lines.append(f"- {status_icon} {req} ({dur:.0f}s, commit={sha})")

    return "\n".join(lines) if lines else ""


# ── Workspace snapshot ─────────────────────────────────────────────────────────
def snapshot_workspace(workspace: str) -> str:
    """Store a file tree snapshot into supervisor memory."""
    import subprocess
    r = subprocess.run(
        "find . -type f -not -path '*/node_modules/*' -not -path '*/.next/*' "
        "-not -path '*/.git/*' | head -60",
        shell=True, capture_output=True, text=True, cwd=workspace)
    tree = r.stdout.strip()
    if tree:
        remember("supervisor", "workspace_tree", tree)
    return tree


def recall_workspace() -> str:
    return recall("supervisor", "workspace_tree")


# ── Learning from builds ───────────────────────────────────────────────────────
def learn_from_build(agent: str, request: str, outcome: str, success: bool):
    """Let an agent learn from a completed build."""
    key = f"build_{datetime.now().strftime('%m%d_%H%M')}"
    value = f"{'SUCCESS' if success else 'FAIL'} | {request[:80]} → {outcome[:120]}"
    remember(agent, key, value)
    if not success:
        remember(agent, "last_failure", value)
    else:
        remember(agent, "last_success", value)


def get_last_failure(agent: str = "coder") -> str:
    return recall(agent, "last_failure")


def get_tech_stack() -> str:
    """Return remembered tech stack for this project."""
    return recall("supervisor", "tech_stack") or "Next.js 15, TypeScript, TailwindCSS v4"


def remember_tech_stack(stack: str):
    remember("supervisor", "tech_stack", stack)
