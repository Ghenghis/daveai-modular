"""
self_improve.py   Weekly self-improvement agent
Runs every Sunday 3am: reviews git history + screenshots UI + asks LLM for improvements
"""
import os, subprocess, schedule, time, logging
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [self-improve] %(message)s")
log = logging.getLogger("self-improve")

WORKSPACE  = os.getenv("WORKSPACE",  "/var/www/agentic-website")
LLM_BASE   = os.getenv("LITELLM_URL", "http://127.0.0.1:4000/v1")
HEAVY      = os.getenv("HEAVY_MODEL", "heavy-coder")
SITE_URL   = os.getenv("SITE_URL",    "https://daveai.tech")
# Brain API URL — used to dispatch improvements; defaults to standard PM2 port
BRAIN_URL  = os.getenv("BRAIN_URL",   "http://localhost:8888")


def git_recent_changes() -> str:
    r = subprocess.run(
        "git log --oneline -20 && git diff HEAD~5 --stat 2>/dev/null | tail -10",
        shell=True, capture_output=True, text=True, cwd=WORKSPACE
    )
    return r.stdout.strip()


def screenshot_site() -> str:
    """Take a screenshot of the live site and return path."""
    path = f"/tmp/site_screenshot_{datetime.now().strftime('%Y%m%d_%H%M')}.png"
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={"width": 1280, "height": 800})
            page.goto(SITE_URL, timeout=30000)
            page.wait_for_timeout(3000)
            page.screenshot(path=path, full_page=True)
            b.close()
        return path
    except Exception as e:
        log.warning(f"Screenshot failed: {e}")
        return ""


def llm_critique(changes: str, screenshot_path: str) -> str:
    from litellm import completion
    prompt = (
        "You are a senior web developer reviewing the daveai.tech agentic website.\n\n"
        f"Recent git changes:\n{changes}\n\n"
        "Based on these changes and general best practices, suggest 3 specific improvements:\n"
        "1. A UX improvement\n"
        "2. A performance improvement\n"
        "3. A feature that would make the site more impressive\n\n"
        "For each, write a short actionable instruction the AI agent can execute."
    )
    try:
        r = completion(
            model=f"openai/{HEAVY}", messages=[{"role": "user", "content": prompt}],
            api_base=LLM_BASE, api_key="local", timeout=120
        )
        return r.choices[0].message.content.strip()
    except Exception as e:
        return f"LLM critique failed: {e}"


def apply_improvements(suggestions: str):
    """Send top improvement to the brain for execution."""
    import httpx
    lines = [l.strip() for l in suggestions.splitlines() if l.strip() and l[0].isdigit()]
    if not lines:
        return
    top = lines[0].lstrip("0123456789.-) ").strip()
    log.info(f"Applying top improvement: {top[:80]}")
    try:
        httpx.post(
            f"{BRAIN_URL}/chat",
            json={"message": f"[self-improve] {top}"},
            timeout=300
        )
    except Exception as e:
        log.warning(f"Could not apply improvement: {e}")


def weekly_improve():
    log.info("Starting weekly self-improvement run")
    changes = git_recent_changes()
    log.info(f"Recent changes:\n{changes[:300]}")

    screenshot = screenshot_site()
    if screenshot:
        log.info(f"Screenshot: {screenshot}")

    suggestions = llm_critique(changes, screenshot)
    log.info(f"LLM suggestions:\n{suggestions}")

    # Write suggestions to workspace
    out = Path(WORKSPACE) / ".ai" / "self-improve-log.md"
    out.parent.mkdir(exist_ok=True)
    with open(out, "a") as f:
        f.write(f"\n## {datetime.now().isoformat()}\n\n{suggestions}\n")

    apply_improvements(suggestions)
    log.info("Weekly self-improvement complete")


if __name__ == "__main__":
    log.info("Self-improve scheduler started")
    schedule.every().sunday.at("03:00").do(weekly_improve)
    # Also run once on startup after a delay (to test)
    schedule.every(24).hours.do(weekly_improve)
    log.info("Scheduled: weekly Sunday 03:00 + daily run")
    while True:
        schedule.run_pending()
        time.sleep(60)
