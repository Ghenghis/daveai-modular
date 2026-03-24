"""brain_skills.py — tool registry: load ALL_SKILLS, role selection, timed execution."""
import time, traceback
from brain_core import AGENT_ROLES
from brain_db import log_event

# ── Load skill registry (p1 + p2 + p3 = ~110 skills) ─────────────────────────
try:
    from agent_skills import (
        ALL_SKILLS, SUPERVISOR_SKILLS, CODER_SKILLS,
        ASSET_SKILLS, QA_SKILLS,
    )
    _LOADED = True
    print(f"[brain_skills] loaded {len(ALL_SKILLS)} skills")
except Exception as _e:
    ALL_SKILLS = []
    SUPERVISOR_SKILLS = CODER_SKILLS = ASSET_SKILLS = QA_SKILLS = []
    _LOADED = False
    print(f"[brain_skills] WARNING: agent_skills not loaded — {_e}")


# ── Role → tool list mapping ───────────────────────────────────────────────────
ROLE_TOOLS: dict = {
    "supervisor": SUPERVISOR_SKILLS,
    "coder":      CODER_SKILLS,
    "asset":      ASSET_SKILLS,
    "qa":         QA_SKILLS,
    "all":        ALL_SKILLS,
}


# ── Tools-by-name lookup (for ReAct dispatch) ─────────────────────────────────
TOOLS_BY_NAME: dict = {t.name: t for t in ALL_SKILLS}



def get_tools(role: str = "all") -> list:
    return ROLE_TOOLS.get(role, ALL_SKILLS)


def get_tool(name: str):
    return TOOLS_BY_NAME.get(name)


# ── Timed, error-safe tool execution ──────────────────────────────────────────
def run_tool(name: str, args: dict, agent: str = "") -> dict:
    """
    Execute a tool by name with timing and error capture.
    Returns {"ok": bool, "result": str, "duration_ms": int}.
    """
    t = TOOLS_BY_NAME.get(name)
    if not t:
        return {"ok": False, "result": f"Unknown tool: {name}", "duration_ms": 0}
    t0 = time.monotonic()
    try:
        result = t.invoke(args)
        ms = int((time.monotonic() - t0) * 1000)
        log_event("tool_call", f"{name} ({ms}ms) agent={agent}")
        return {"ok": True, "result": str(result)[:2000], "duration_ms": ms}
    except Exception as e:
        ms = int((time.monotonic() - t0) * 1000)
        tb = traceback.format_exc()[-300:]
        log_event("tool_error", f"{name}: {e}")
        return {"ok": False, "result": f"Tool error: {e}\n{tb}", "duration_ms": ms}


# ── Tool description list for LLM prompts ─────────────────────────────────────
def tools_manifest(role: str = "all", max_tools: int = 30) -> str:
    """Return a compact tool list string for injecting into LLM prompts."""
    tools = get_tools(role)[:max_tools]
    lines = []
    for t in tools:
        desc = (t.description or "").split("\n")[0][:80]
        lines.append(f"- {t.name}: {desc}")
    return "\n".join(lines)


# ── Skill health check ────────────────────────────────────────────────────────
def skills_status() -> dict:
    return {
        "loaded": _LOADED,
        "total":  len(ALL_SKILLS),
        "by_role": {r: len(ROLE_TOOLS.get(r, [])) for r in AGENT_ROLES},
        "tools":  [t.name for t in ALL_SKILLS],
    }
