"""brain_watchdog.py — health checks, auto-restart detection, alerting, metrics."""
import subprocess, threading, time, json
from datetime import datetime
from brain_core import LLM_BASE, ZC_URL, WORKSPACE
from brain_db import log_event, mem_set, mem_get

# ── Service registry ───────────────────────────────────────────────────────────
SERVICES = {
    "litellm":    {"url": f"{LLM_BASE.removesuffix('/v1')}/v1/models", "pm2": "litellm"},
    "zeroclaw":   {"url": f"{ZC_URL}/health",                 "pm2": "zeroclaw"},
    "agentic-ui": {"url": "http://127.0.0.1:3001/",           "pm2": "agentic-ui"},
}

_metrics: dict = {
    svc: {"status": "unknown", "latency_ms": 0, "ts": "", "failures": 0}
    for svc in SERVICES
}
_metrics_lock = threading.Lock()


# ── HTTP health probe ──────────────────────────────────────────────────────────
def _probe(url: str, timeout: int = 5) -> tuple[bool, int]:
    import urllib.request
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(url, timeout=timeout):
            ms = int((time.monotonic() - t0) * 1000)
            return True, ms
    except Exception:
        ms = int((time.monotonic() - t0) * 1000)
        return False, ms


# ── PM2 restart ────────────────────────────────────────────────────────────────
def _pm2_restart(name: str) -> str:
    r = subprocess.run(f"pm2 restart {name} 2>&1",
                       shell=True, capture_output=True, text=True, timeout=15)
    return r.stdout.strip() or r.stderr.strip()


# ── Single check cycle ─────────────────────────────────────────────────────────
def check_all() -> dict:
    results = {}
    for svc, cfg in SERVICES.items():
        ok, ms = _probe(cfg["url"])
        ts = datetime.now().isoformat()
        with _metrics_lock:
            prev = _metrics[svc]
            if not ok:
                _metrics[svc]["failures"] = prev.get("failures", 0) + 1
            else:
                _metrics[svc]["failures"] = 0
            _metrics[svc].update({"status": "ok" if ok else "down",
                                   "latency_ms": ms, "ts": ts})
            failures = _metrics[svc]["failures"]
        results[svc] = {"ok": ok, "ms": ms}

        # Auto-restart after 3 consecutive failures
        if failures == 3 and cfg.get("pm2"):
            log_event("watchdog_restart", f"{svc} restarted after {failures} failures")
            _pm2_restart(cfg["pm2"])
    return results


# ── Disk + memory snapshot ────────────────────────────────────────────────────
def system_metrics() -> dict:
    metrics = {}
    try:
        r = subprocess.run("df -h / 2>&1 | tail -1", shell=True,
                           capture_output=True, text=True)
        metrics["disk"] = r.stdout.strip()
    except Exception:
        metrics["disk"] = "unknown"
    try:
        r = subprocess.run("free -m 2>&1 | grep Mem", shell=True,
                           capture_output=True, text=True)
        metrics["memory"] = r.stdout.strip()
    except Exception:
        metrics["memory"] = "unknown"
    try:
        r = subprocess.run("pm2 jlist 2>&1", shell=True,
                           capture_output=True, text=True)
        procs = json.loads(r.stdout)
        metrics["pm2"] = [{"name": p["name"], "status": p["pm2_env"]["status"],
                            "restarts": p["pm2_env"]["restart_time"]}
                          for p in procs]
    except Exception:
        metrics["pm2"] = []
    return metrics


# ── Git workspace health ──────────────────────────────────────────────────────
def workspace_health() -> dict:
    r = subprocess.run("git status --short 2>&1 | wc -l && git log --oneline -1 2>&1",
                       shell=True, capture_output=True, text=True, cwd=WORKSPACE)
    return {"output": r.stdout.strip()}


# ── Background monitor thread ─────────────────────────────────────────────────
_monitor_thread: threading.Thread | None = None
_stop_event = threading.Event()


def start_monitor(interval_s: int = 60):
    global _monitor_thread
    if _monitor_thread and _monitor_thread.is_alive():
        return

    def _loop():
        while not _stop_event.wait(interval_s):
            try:
                results = check_all()
                down = [k for k, v in results.items() if not v["ok"]]
                if down:
                    log_event("watchdog_alert", f"DOWN: {','.join(down)}")
            except Exception:
                pass

    _monitor_thread = threading.Thread(target=_loop, daemon=True, name="watchdog")
    _monitor_thread.start()


def stop_monitor():
    _stop_event.set()


# ── Public snapshot ───────────────────────────────────────────────────────────
def full_status() -> dict:
    with _metrics_lock:
        svc_snap = dict(_metrics)
    return {
        "services":  svc_snap,
        "system":    system_metrics(),
        "workspace": workspace_health(),
        "ts":        datetime.now().isoformat(),
    }
