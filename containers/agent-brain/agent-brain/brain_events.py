"""brain_events.py — structured event schema v1, SSE queues, global bus."""
import json, queue, threading, uuid
from datetime import datetime, timezone
from brain_core import _agent_status, _pqueues, _event_bus, AGENT_ROLES

_seq_lock = threading.Lock()
_seq = 0

def _next_seq() -> int:
    global _seq
    with _seq_lock:
        _seq += 1
        return _seq


# ── Structured event factory ───────────────────────────────────────────────────
def make_event(evt_type: str, *, agent: str = "", phase: str = "",
               progress: int = 0, msg: str = "", span_id: str = "", **extra) -> dict:
    return {
        "v": 1, "type": evt_type,
        "seq": _next_seq(),
        "span_id": span_id or uuid.uuid4().hex[:8],
        "ts": datetime.now(timezone.utc).isoformat(),
        "agent": agent, "phase": phase,
        "progress": max(0, min(100, progress)),
        "msg": msg, **extra,
    }


# ── Agent status ───────────────────────────────────────────────────────────────
def agent_set(name: str, status: str, task: str, progress: int, model: str = ""):
    if name not in _agent_status:
        return
    _agent_status[name] = {
        "status": status, "task": task, "progress": progress,
        "model": model, "ts": datetime.now(timezone.utc).isoformat(),
    }

def agent_reset_all():
    for role in AGENT_ROLES:
        agent_set(role, "idle", "", 0, "")


# ── SSE emit (per-request queue + global bus) ─────────────────────────────────
_bus_listeners: list = []
_bus_lock = threading.Lock()

def emit(q, evt_type: str, *, agent: str = "", phase: str = "",
         progress: int = 0, msg: str = "", **extra):
    event = make_event(evt_type, agent=agent, phase=phase,
                       progress=progress, msg=msg, **extra)
    if q is not None:
        try: q.put_nowait(event)
        except Exception: pass
    _bus_push(event)


def _bus_push(event: dict):
    try:
        _event_bus.append(event)
        if len(_event_bus) > 500:
            del _event_bus[:100]
    except Exception: pass
    with _bus_lock:
        dead = []
        for lq in _bus_listeners:
            try: lq.put_nowait(event)
            except Exception: dead.append(lq)
        for lq in dead:
            try: _bus_listeners.remove(lq)
            except ValueError: pass


# ── Global event bus for /events monitor endpoint ────────────────────────────
def bus_subscribe() -> queue.Queue:
    q: queue.Queue = queue.Queue(maxsize=200)
    with _bus_lock:
        _bus_listeners.append(q)
    return q

def bus_unsubscribe(q: queue.Queue):
    with _bus_lock:
        try: _bus_listeners.remove(q)
        except ValueError: pass


# ── Request queue management ──────────────────────────────────────────────────
def new_req_queue(req_id: str) -> queue.Queue:
    pq: queue.Queue = queue.Queue(maxsize=500)
    _pqueues[req_id] = pq
    return pq

def close_req_queue(req_id: str):
    q = _pqueues.pop(req_id, None)
    if q:
        try: q.put_nowait(None)
        except Exception: pass


# ── SSE wire format ────────────────────────────────────────────────────────────
def sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"

def sse_start(req_id: str) -> str:
    return sse(make_event("start", msg="DaveAI starting...", progress=0, req_id=req_id))

def sse_end() -> str:
    return sse(make_event("end", progress=100))
