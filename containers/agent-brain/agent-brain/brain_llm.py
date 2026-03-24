"""brain_llm.py — LLM abstraction: 3-stage fallback, streaming, JSON mode, caching."""
import json, time, hashlib, threading
from brain_core import LLM_BASE, HEAVY, FAST, VISION, ANTHROPIC_KEY
from brain_events import agent_set, emit

try:
    from litellm import completion as _litellm_completion
    _LITELLM_OK = True
except ImportError:
    _LITELLM_OK = False

# ── Simple response cache (LRU-ish, 128 slots) ─────────────────────────────────
_cache: dict = {}
_cache_lock = threading.Lock()
_CACHE_MAX = 128
_CACHE_TTL = 300  # seconds


def _cache_key(model: str, prompt: str, system: str) -> str:
    raw = f"{model}|{system[:80]}|{prompt[:200]}"
    return hashlib.md5(raw.encode()).hexdigest()


def _cache_get(key: str) -> str | None:
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.monotonic() - entry["ts"]) < _CACHE_TTL:
            return entry["value"]
    return None


def _cache_put(key: str, value: str):
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX:
            oldest = min(_cache, key=lambda k: _cache[k]["ts"])
            del _cache[oldest]
        _cache[key] = {"value": value, "ts": time.monotonic()}


# ── Core litellm call (single attempt) ────────────────────────────────────────
def _litellm_call(model: str, msgs: list, stream: bool = False,
                  timeout: int = 300, q=None, stream_label: str = "") -> str:
    if not _LITELLM_OK:
        return ""
    if stream:
        collected = []
        reasoning_collected = []
        r = _litellm_completion(
            model=f"openai/{model}", messages=msgs,
            api_base=LLM_BASE, api_key="local", timeout=timeout,
            stream=True, max_tokens=4096)
        for chunk in r:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta:
                token = getattr(delta, "content", "") or ""
                reasoning = getattr(delta, "reasoning_content", "") or ""
                if token:
                    collected.append(token)
                    if q and stream_label:
                        emit(q, "token", token=token, msg=token, label=stream_label)
                elif reasoning:
                    reasoning_collected.append(reasoning)
        result = "".join(collected).strip()
        if not result:
            result = "".join(reasoning_collected).strip()
        return result
    else:
        r = _litellm_completion(
            model=f"openai/{model}", messages=msgs,
            api_base=LLM_BASE, api_key="local", timeout=timeout,
            max_tokens=4096)
        msg_obj = r.choices[0].message
        text = (msg_obj.content or "").strip()
        if not text:
            text = (getattr(msg_obj, "reasoning_content", "") or "").strip()
        return text


# ── Anthropic direct fallback (when LM Studio PCs offline) ───────────────────
def _anthropic_call(prompt: str, system: str = "", timeout: int = 60) -> str:
    key = ANTHROPIC_KEY
    if not key:
        return ""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=key)
        msgs = []
        if system:
            msgs.append({"role": "user", "content": f"[SYSTEM]\n{system}\n\n{prompt}"})
        else:
            msgs.append({"role": "user", "content": prompt})
        resp = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4096,
            messages=msgs,
            timeout=timeout)
        return resp.content[0].text if resp.content else ""
    except Exception as e:
        return f"[anthropic error: {e}]"


# ── Public LLM interface ───────────────────────────────────────────────────────
def llm(model: str, prompt: str, system: str = "", *,
        q=None, stream_label: str = "", agent_name: str = "",
        use_cache: bool = False, timeout: int = 300) -> str:
    """
    3-stage fallback:
      1. litellm streaming  (model param → heavy-coder / fast-agent)
      2. litellm non-stream (same model, no stream)
      3. anthropic direct   (claude-sonnet-4-5, if ANTHROPIC_KEY set)
    """
    if agent_name:
        agent_set(agent_name, "working", prompt[:60], 50, model)

    if use_cache:
        ck = _cache_key(model, prompt, system)
        cached = _cache_get(ck)
        if cached:
            if agent_name:
                agent_set(agent_name, "done", cached[:60], 100, model)
            return cached

    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})

    text = ""

    # Stage 1 — litellm streaming
    try:
        text = _litellm_call(model, msgs, stream=True, timeout=timeout,
                             q=q, stream_label=stream_label)
    except Exception:
        pass

    # Stage 2 — litellm non-streaming
    if not text:
        try:
            text = _litellm_call(model, msgs, stream=False, timeout=timeout)
        except Exception:
            pass

    # Stage 3 — try fast-agent if heavy-coder failed
    if not text and model == HEAVY:
        try:
            text = _litellm_call(FAST, msgs, stream=False, timeout=60)
        except Exception:
            pass

    # Stage 4 — anthropic direct fallback
    if not text:
        text = _anthropic_call(prompt, system, timeout=60)

    result = text or "[LLM: no response]"

    if use_cache and result and not result.startswith("[LLM"):
        _cache_put(ck, result)

    if agent_name:
        status = "done" if result and not result.startswith("[LLM") else "error"
        agent_set(agent_name, status, result[:60], 100, model)

    return result


def llm_json(model: str, prompt: str, system: str = "", **kwargs) -> dict:
    """LLM call that forces JSON output and parses it."""
    json_sys = (system + "\n\nRespond ONLY with valid JSON. No prose, no markdown."
                if system else "Respond ONLY with valid JSON. No prose, no markdown.")
    raw = llm(model, prompt, json_sys, **kwargs)
    # try to extract JSON from response
    for start in [raw.find("{"), raw.find("[")]:
        if start >= 0:
            try:
                return json.loads(raw[start:])
            except Exception:
                pass
    # fallback: wrap raw in a dict
    return {"raw": raw}


def llm_fast(prompt: str, system: str = "", **kwargs) -> str:
    return llm(FAST, prompt, system, **kwargs)


def llm_heavy(prompt: str, system: str = "", **kwargs) -> str:
    return llm(HEAVY, prompt, system, **kwargs)
