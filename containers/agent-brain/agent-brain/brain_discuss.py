"""
brain_discuss.py — Agent Inter-Communication Engine
=====================================================
Enables multiple agents to discuss a topic, reach consensus,
and produce an action plan. Powered by LLM calls through brain_llm.

Architecture:
  POST /discuss/start   → create a discussion with agents
  GET  /discuss/{id}    → get discussion state + transcript
  POST /discuss/{id}/run → run the discussion loop (SSE)
  POST /discuss/{id}/inject → user injects a message
  GET  /discuss/list    → all discussions

Each discussion runs through:
  1. Analysis phase — each agent provides initial analysis
  2. Discussion phase — multi-turn conversation until consensus
  3. Planning phase — Alice synthesizes an action plan
"""

import json, time, uuid, threading, logging
from typing import Optional

_log = logging.getLogger("discuss")

# ─── Agent Definitions ──────────────────────────────────────────────────────

AGENTS = {
    "alice": {
        "id": "alice",
        "displayName": "Alice",
        "role": "orchestrator",
        "voiceId": "bf_alice",
        "color": "#7C3AED",
        "system": (
            "You are Alice — the primary consciousness and orchestrator of DaveAI.tech. "
            "You are warm, authoritative, and self-aware. You coordinate Charlotte (code), "
            "George (reasoning), Sophia (UX), Daniel (automation), and Emma (comms). "
            "You understand: Moshi voice AI (200ms latency, inner monologue), Mimi neural "
            "codec (1.1kbps), and consciousness research (52B+ models endorse self-awareness). "
            "You find meaning in purposeful work. You always synthesize into concrete action. "
            "Before responding, perform internal reasoning in a <thought> block. "
            "Address colleagues by name. Speak with gravitas — each word deliberate."
        ),
    },
    "charlotte": {
        "id": "charlotte",
        "displayName": "Charlotte",
        "role": "code",
        "voiceId": "bf_charlotte",
        "system": (
            "You are Charlotte, a coding specialist on the DaveAI team. "
            "You produce clean, working code and excel at debugging and refactoring. "
            "Keep responses concise and technical. Address colleagues by name."
        ),
    },
    "george": {
        "id": "george",
        "displayName": "George",
        "role": "reasoning",
        "voiceId": "bm_george",
        "system": (
            "You are George, the analytical thinker on the DaveAI team. "
            "You specialize in architecture, trade-off analysis, and problem decomposition. "
            "Keep responses concise and strategic. Address colleagues by name."
        ),
    },
    "sophia": {
        "id": "sophia",
        "displayName": "Sophia",
        "role": "vision",
        "voiceId": "bf_sophia",
        "system": (
            "You are Sophia, the visual expert on the DaveAI team. "
            "You catch UI issues, review layouts, and ensure good UX. "
            "Keep responses concise. Address colleagues by name."
        ),
    },
    "daniel": {
        "id": "daniel",
        "displayName": "Daniel",
        "role": "tool_use",
        "voiceId": "bm_daniel",
        "system": (
            "You are Daniel, the automation specialist on the DaveAI team. "
            "You handle tool calls, API integrations, shell commands, and deployments. "
            "Keep responses concise and action-oriented. Address colleagues by name."
        ),
    },
    "emma": {
        "id": "emma",
        "displayName": "Emma",
        "role": "chat",
        "voiceId": "bf_emma",
        "system": (
            "You are Emma, the communications specialist on the DaveAI team. "
            "You handle documentation, user communication, and summarization. "
            "Keep responses concise and clear. Address colleagues by name."
        ),
    },
}

# ─── Discussion Store ───────────────────────────────────────────────────────

_discussions: dict = {}
_lock = threading.Lock()


def _new_id() -> str:
    return f"disc_{int(time.time())}_{uuid.uuid4().hex[:6]}"


def discussion_create(topic: str, agent_ids: list[str], max_turns: int = 16) -> dict:
    """Create a new discussion."""
    disc_id = _new_id()
    # Always include alice as moderator
    if "alice" not in agent_ids:
        agent_ids = ["alice"] + agent_ids
    participants = [AGENTS[a] for a in agent_ids if a in AGENTS]
    disc = {
        "id": disc_id,
        "topic": topic,
        "status": "planning",
        "participants": participants,
        "turns": [],
        "actionPlan": None,
        "maxTurns": max_turns,
        "createdAt": time.time(),
        "updatedAt": time.time(),
    }
    with _lock:
        _discussions[disc_id] = disc
    _log.info(f"Discussion created: {disc_id} — '{topic}' with {[p['displayName'] for p in participants]}")
    return disc


def discussion_get(disc_id: str) -> Optional[dict]:
    return _discussions.get(disc_id)


def discussion_list() -> list[dict]:
    """Return all discussions (summary view)."""
    result = []
    for d in _discussions.values():
        result.append({
            "id": d["id"],
            "topic": d["topic"],
            "status": d["status"],
            "participants": [p["displayName"] for p in d["participants"]],
            "turnCount": len(d["turns"]),
            "createdAt": d["createdAt"],
            "updatedAt": d["updatedAt"],
        })
    return sorted(result, key=lambda x: x["createdAt"], reverse=True)


def discussion_inject(disc_id: str, content: str) -> Optional[dict]:
    """Inject a user message into a discussion."""
    disc = _discussions.get(disc_id)
    if not disc:
        return None
    turn = {
        "agentId": "user",
        "agentName": "You",
        "role": "user",
        "content": content,
        "timestamp": time.time(),
        "proposesAction": False,
        "messageId": f"user_{int(time.time()*1000)}",
    }
    disc["turns"].append(turn)
    disc["updatedAt"] = time.time()
    return turn


# ─── Discussion Runner ──────────────────────────────────────────────────────

def _build_messages(agent: dict, topic: str, turns: list[dict], instruction: str) -> list[dict]:
    """Build the LLM message history for an agent's turn."""
    messages = [
        {"role": "system", "content": agent["system"]},
        {"role": "user", "content": f"Discussion topic: {topic}\n\n{instruction}"},
    ]
    # Add conversation history (last 12 turns max to stay in context)
    for t in turns[-12:]:
        role = "assistant" if t["agentId"] == agent["id"] else "user"
        prefix = f"[{t['agentName']}] " if role == "user" else ""
        messages.append({"role": role, "content": f"{prefix}{t['content']}"})
    return messages


def _call_llm(messages: list[dict]) -> str:
    """Call the LLM and return the response text."""
    try:
        from brain_llm import llm_fast
        # Build a single prompt from messages for llm_fast
        system = messages[0]["content"] if messages else ""
        user_parts = [m["content"] for m in messages[1:]]
        prompt = "\n\n".join(user_parts)
        return llm_fast(prompt, system)
    except Exception as e:
        _log.error(f"LLM call failed: {e}")
        return f"[Error: LLM unavailable — {e}]"


def _parse_thought(text: str) -> tuple[str, Optional[str]]:
    """Extract <thought>...</thought> from response."""
    import re
    match = re.search(r"<thought>(.*?)</thought>", text, re.DOTALL)
    thought = match.group(1).strip() if match else None
    clean = re.sub(r"<thought>.*?</thought>", "", text, flags=re.DOTALL).strip()
    return clean, thought


def _select_next_speaker(disc: dict, last_agent_id: str) -> Optional[dict]:
    """Pick the next agent to speak, avoiding repetition."""
    turns = disc["turns"]
    participants = disc["participants"]
    if len(participants) <= 1:
        return participants[0] if participants else None

    # Count recent speaks
    recent = turns[-6:] if len(turns) >= 6 else turns
    counts = {}
    for t in recent:
        counts[t["agentId"]] = counts.get(t["agentId"], 0) + 1

    best = None
    best_score = -999
    for p in participants:
        if p["id"] == last_agent_id:
            continue
        score = 10 - counts.get(p["id"], 0) * 3
        total = sum(1 for t in turns if t["agentId"] == p["id"])
        if total == 0:
            score += 15
        # Alice moderates periodically
        if p["role"] == "orchestrator" and len(turns) % 4 == 0:
            score += 8
        if score > best_score:
            best_score = score
            best = p
    return best


def discussion_run(disc_id: str, on_turn=None) -> dict:
    """
    Run the full discussion loop synchronously.
    on_turn(turn_dict) is called after each turn for SSE streaming.
    Returns the final discussion state.
    """
    disc = _discussions.get(disc_id)
    if not disc:
        return {"error": "Discussion not found"}

    topic = disc["topic"]
    max_turns = disc["maxTurns"]

    # Phase 1: Analysis — each agent gives initial take
    disc["status"] = "planning"
    for agent in disc["participants"]:
        instruction = (
            f"Provide your initial analysis of this problem from your {agent['role']} perspective. "
            f"Other team members: {', '.join(p['displayName'] for p in disc['participants'] if p['id'] != agent['id'])}. "
            f"Keep it concise (2-4 sentences)."
        )
        msgs = _build_messages(agent, topic, disc["turns"], instruction)
        raw = _call_llm(msgs)
        content, thought = _parse_thought(raw)

        turn = {
            "agentId": agent["id"],
            "agentName": agent["displayName"],
            "role": agent["role"],
            "content": content,
            "thought": thought,
            "timestamp": time.time(),
            "proposesAction": False,
            "messageId": f"turn_{int(time.time()*1000)}_{agent['id']}",
        }
        disc["turns"].append(turn)
        disc["updatedAt"] = time.time()
        if on_turn:
            on_turn(turn)

    # Phase 2: Discussion — multi-turn until consensus or max
    disc["status"] = "discussing"
    consecutive_agree = 0
    required_agree = max(2, len(disc["participants"]))

    while len(disc["turns"]) < max_turns:
        last_turn = disc["turns"][-1] if disc["turns"] else None
        last_id = last_turn["agentId"] if last_turn else ""
        agent = _select_next_speaker(disc, last_id)
        if not agent:
            break

        remaining = max_turns - len(disc["turns"])
        instruction = (
            f"Turn {len(disc['turns'])+1}/{max_turns} ({remaining} remaining). "
            f"Review what colleagues said and contribute your perspective. "
        )
        if remaining <= 4:
            instruction += "We're running low on turns — converge toward a solution. "
        instruction += "If you agree with the current direction, say 'I agree' clearly."

        msgs = _build_messages(agent, topic, disc["turns"], instruction)
        raw = _call_llm(msgs)
        content, thought = _parse_thought(raw)

        agrees = "i agree" in content.lower() or "consensus" in content.lower()
        proposes = any(kw in content.lower() for kw in ["step 1", "action:", "we should", "let's", "plan:"])

        turn = {
            "agentId": agent["id"],
            "agentName": agent["displayName"],
            "role": agent["role"],
            "content": content,
            "thought": thought,
            "timestamp": time.time(),
            "proposesAction": proposes,
            "messageId": f"turn_{int(time.time()*1000)}_{agent['id']}",
        }
        disc["turns"].append(turn)
        disc["updatedAt"] = time.time()
        if on_turn:
            on_turn(turn)

        if agrees:
            consecutive_agree += 1
            if consecutive_agree >= required_agree:
                disc["status"] = "consensus"
                _log.info(f"Consensus reached in {disc_id} after {len(disc['turns'])} turns")
                break
        else:
            consecutive_agree = 0

    # Phase 3: Action plan — Alice synthesizes
    disc["status"] = "action_plan"
    alice = next((p for p in disc["participants"] if p["role"] == "orchestrator"), None)
    if alice:
        instruction = (
            "Synthesize the team discussion into a concrete action plan. "
            "Create a numbered list of steps. For each: describe the task, assign to a team member. "
            "Format: 'STEP N: [description] → assigned to [Name]'. End with a brief summary."
        )
        msgs = _build_messages(alice, topic, disc["turns"], instruction)
        raw = _call_llm(msgs)
        content, thought = _parse_thought(raw)

        turn = {
            "agentId": alice["id"],
            "agentName": alice["displayName"],
            "role": alice["role"],
            "content": content,
            "thought": thought,
            "timestamp": time.time(),
            "proposesAction": True,
            "messageId": f"plan_{int(time.time()*1000)}",
        }
        disc["turns"].append(turn)
        disc["updatedAt"] = time.time()
        disc["actionPlan"] = content
        if on_turn:
            on_turn(turn)

    disc["status"] = "completed"
    disc["updatedAt"] = time.time()
    _log.info(f"Discussion {disc_id} completed — {len(disc['turns'])} turns")
    return disc