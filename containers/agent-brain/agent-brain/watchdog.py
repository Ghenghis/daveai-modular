"""
watchdog.py  — DEPRECATED / LEGACY standalone watchdog.
DO NOT register this in PM2 alongside brain_api.py v4.

In v4, the watchdog is integrated into brain_api.py via brain_watchdog.py,
which is started as a daemon thread inside the FastAPI app on startup
(brain_api.py → on_startup → start_monitor(interval_s=60)).

This file is kept for reference only. If you need a standalone external
watchdog (e.g. to restart brain_api.py itself if it crashes), run only
this file — but never simultaneously with brain_watchdog.py.
"""
import subprocess, time, httpx, os, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [watchdog] %(message)s")
log = logging.getLogger("watchdog")

CHECKS = [
    {"name": "agent-brain", "url": "http://localhost:8888/health", "pm2": "agent-brain"},
    {"name": "litellm",     "url": "http://localhost:4000/v1/models", "pm2": "litellm"},
    {"name": "agentic-ui",  "url": "http://localhost:3001",         "pm2": "agentic-ui"},
]

ZEROCLAW_DOCKER = True   # set False if running ZeroClaw natively

def check_http(url: str) -> bool:
    try:
        r = httpx.get(url, timeout=5)
        return r.status_code < 500
    except Exception:
        return False

def restart_pm2(name: str):
    log.warning(f"Restarting {name} via PM2")
    subprocess.run(["pm2", "restart", name], capture_output=True)

def check_zeroclaw():
    if ZEROCLAW_DOCKER:
        r = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Status}}", "zeroclaw"],
            capture_output=True, text=True
        )
        return r.stdout.strip() == "running"
    return check_http("http://localhost:3000/health")

def restart_zeroclaw():
    log.warning("Restarting ZeroClaw container")
    subprocess.run(["docker", "compose", "restart", "zeroclaw"],
                   cwd="/opt/zeroclaw", capture_output=True)

if __name__ == "__main__":
    log.info("Watchdog started  checking every 60s")
    consecutive_fails = {s["name"]: 0 for s in CHECKS}
    consecutive_fails["zeroclaw"] = 0

    while True:
        # Check PM2 services
        for svc in CHECKS:
            ok = check_http(svc["url"])
            if not ok:
                consecutive_fails[svc["name"]] += 1
                log.warning(f"{svc['name']} down ({consecutive_fails[svc['name']]} checks)")
                if consecutive_fails[svc["name"]] >= 2:
                    restart_pm2(svc["pm2"])
                    consecutive_fails[svc["name"]] = 0
            else:
                consecutive_fails[svc["name"]] = 0

        # Check ZeroClaw
        if not check_zeroclaw():
            consecutive_fails["zeroclaw"] += 1
            log.warning(f"ZeroClaw down ({consecutive_fails['zeroclaw']} checks)")
            if consecutive_fails["zeroclaw"] >= 2:
                restart_zeroclaw()
                consecutive_fails["zeroclaw"] = 0
        else:
            consecutive_fails["zeroclaw"] = 0

        time.sleep(60)
