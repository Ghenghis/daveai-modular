"""
DaveAI Agent Skills — Part 3 (Phase C / Extended)
Git+, Archive, NPM+, PM2+, QA+, Infra+, AI+, DB, SEO, Comms+, Security+

Inspired by OpenClaw community skills registry and DaveAI project gaps.
Each skill follows the same _sh/_pw/_llm pattern used in p1/p2.
"""
import os
import subprocess
import json
import re
import socket
import sqlite3
from datetime import datetime
from pathlib import Path

from langchain_core.tools import tool
from dotenv import load_dotenv

load_dotenv()

WORKSPACE = os.getenv("WORKSPACE", "/var/www/agentic-website")
LLM_BASE = os.getenv("LITELLM_URL", "http://127.0.0.1:4000/v1")
FAST = os.getenv("FAST_MODEL", "fast-agent")
HEAVY = os.getenv("HEAVY_MODEL", "heavy-coder")
DB_PATH = os.getenv("DB_PATH", "/opt/agent-brain/daveai.db")
BACKUP_DIR = "/opt/agent-brain/backups"
SCREENSHOT_DIR = "/opt/agent-brain/screenshots"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sh(cmd: str, cwd: str = None, timeout: int = 120) -> str:
    """Run shell command safely with timeout and output truncation."""
    try:
        r = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=cwd or WORKSPACE,
        )
        out = (r.stdout.strip() or r.stderr.strip() or "done")
        return out[:4000]
    except subprocess.TimeoutExpired:
        return "error: command timed out"
    except Exception as e:
        return f"error: {e}"


def _safe_path(p: str) -> str:
    """Resolve path and enforce workspace boundary."""
    resolved = os.path.realpath(os.path.join(WORKSPACE, p))
    if not resolved.startswith(os.path.realpath(WORKSPACE)):
        return ""
    return resolved


def _llm(prompt: str, system: str = "", model: str = None) -> str:
    """Call LiteLLM for AI-powered skills."""
    try:
        from litellm import completion
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": prompt})
        r = completion(
            model=f"openai/{model or FAST}",
            messages=msgs,
            api_base=LLM_BASE,
            api_key="local",
            timeout=60,
        )
        return (r.choices[0].message.content or "").strip()[:4000]
    except Exception as e:
        return f"error: LLM call failed — {e}"


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Git Extended (Recovery & History)
# Inspired by: git-essentials, git-workflows, emergency-rescue, unfuck-my-git-state
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def git_log(n: int = 15) -> str:
    """Show last N git commits (hash, author, date, message) for the workspace."""
    return _sh(f"git log --oneline --decorate --graph -n {int(min(n, 50))}")


@tool
def git_reset(mode: str = "soft", ref: str = "HEAD~1") -> str:
    """Reset workspace git to a ref. mode: soft|mixed|hard. Hard loses uncommitted work.
    Always creates a safety stash before hard reset."""
    if mode not in ("soft", "mixed", "hard"):
        return "error: mode must be soft, mixed, or hard"
    safe_ref = re.sub(r"[^a-zA-Z0-9~^./\-_]", "", ref)
    if mode == "hard":
        stash = _sh("git stash push -m 'auto-stash before hard reset'")
        reset = _sh(f"git reset --hard {safe_ref}")
        return f"stash: {stash}\nreset: {reset}"
    return _sh(f"git reset --{mode} {safe_ref}")


@tool
def git_cherry_pick(commit_hash: str) -> str:
    """Apply a specific commit onto the current branch."""
    safe = re.sub(r"[^a-fA-F0-9]", "", commit_hash)[:40]
    if len(safe) < 7:
        return "error: invalid commit hash"
    return _sh(f"git cherry-pick {safe}")


@tool
def git_blame(file_path: str, start_line: int = 1, end_line: int = 50) -> str:
    """Show git blame for a file (who changed each line). Limited to 50 lines."""
    sp = _safe_path(file_path)
    if not sp:
        return "error: path outside workspace"
    end = min(end_line, start_line + 50)
    return _sh(f"git blame -L {start_line},{end} -- {sp}")


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Archive / File System Extended
# Inspired by: backup, simple-backup, clawdbot-backup
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def archive_create(label: str = "") -> str:
    """Create timestamped tar.gz of workspace (excludes node_modules, .next, .git)."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"archive{('-' + label) if label else ''}-{ts}.tar.gz"
    _sh(f"mkdir -p {BACKUP_DIR}", "/root")
    dest = f"{BACKUP_DIR}/{name}"
    out = _sh(
        f"tar -czf {dest} --exclude=./node_modules --exclude=./.next "
        f"--exclude=./.git . 2>&1 | tail -5",
        WORKSPACE, 120,
    )
    size = _sh(f"du -sh {dest} 2>/dev/null | cut -f1", "/root")
    return f"created: {dest} ({size.strip()})\n{out}"


@tool
def archive_extract(archive_path: str, dest_path: str = "") -> str:
    """Extract tar.gz or zip archive. Default dest is workspace."""
    dest = dest_path or WORKSPACE
    if not os.path.isfile(archive_path):
        return f"error: archive not found: {archive_path}"
    _sh(f"mkdir -p {dest}", "/root")
    if archive_path.endswith(".zip"):
        return _sh(f"unzip -o '{archive_path}' -d '{dest}' 2>&1 | tail -10", "/root", 120)
    return _sh(f"tar -xzf '{archive_path}' -C '{dest}' 2>&1 | tail -10", "/root", 120)


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: NPM / Build Extended
# Inspired by: nextjs-expert, senior-frontend, web-deploy
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def npm_install_pkg(package: str, dev: bool = False) -> str:
    """Install a specific npm package. Set dev=True for devDependencies."""
    pkg = re.sub(r"[^a-zA-Z0-9@/._\-]", "", package)
    if not pkg:
        return "error: invalid package name"
    flag = "--save-dev" if dev else "--save"
    return _sh(f"npm install {flag} {pkg} 2>&1 | tail -15", WORKSPACE, 120)


@tool
def npm_uninstall_pkg(package: str) -> str:
    """Uninstall a specific npm package."""
    pkg = re.sub(r"[^a-zA-Z0-9@/._\-]", "", package)
    if not pkg:
        return "error: invalid package name"
    return _sh(f"npm uninstall {pkg} 2>&1 | tail -8", WORKSPACE, 60)


@tool
def next_analyze() -> str:
    """Analyze Next.js bundle size. Requires @next/bundle-analyzer configured."""
    return _sh(
        "ANALYZE=true npm run build 2>&1 | grep -E '(Route|Size|First|chunk|page|\\d+\\s*(kB|MB))' | head -30",
        WORKSPACE, 300,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: PM2 Extended
# Inspired by: pm2 (asteinberger)
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def pm2_save() -> str:
    """Save current PM2 process list so it persists across reboots."""
    return _sh("pm2 save 2>&1", "/root", 15)


@tool
def pm2_delete(process_name: str) -> str:
    """Delete a PM2 managed process. Use with caution."""
    name = re.sub(r"[^a-zA-Z0-9_\-]", "", process_name)
    if not name:
        return "error: invalid process name"
    return _sh(f"pm2 delete {name} 2>&1", "/root", 15)


@tool
def pm2_reload(process_name: str) -> str:
    """Zero-downtime reload of a PM2 process (cluster mode)."""
    name = re.sub(r"[^a-zA-Z0-9_\-]", "", process_name)
    if not name:
        return "error: invalid process name"
    return _sh(f"pm2 reload {name} 2>&1", "/root", 30)


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: QA Extended
# Inspired by: webapp-testing, vibetesting, ui-audit, ux-audit, senior-qa,
#              test-patterns, web-qa-bot, playwright-cli
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def playwright_click_test(url: str, selector: str) -> str:
    """Test that a button/link is clickable and doesn't error. Returns pass/fail."""
    script = f"""
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    pg.goto("{url}", timeout=15000)
    pg.wait_for_load_state("networkidle")
    el = pg.query_selector("{selector}")
    if not el:
        print("FAIL: selector not found")
    else:
        el.click()
        import time; time.sleep(1)
        print("PASS: clicked successfully, url=" + pg.url)
    b.close()
"""
    try:
        code = f"from playwright.sync_api import sync_playwright\n{script}"
        r = subprocess.run(
            ["/opt/agent-brain/venv/bin/python3", "-c", code],
            capture_output=True, text=True, timeout=30,
        )
        return (r.stdout.strip() or r.stderr.strip() or "done")[:2000]
    except Exception as e:
        return f"error: {e}"


@tool
def html_validate(file_path: str = "out/index.html") -> str:
    """Validate HTML file for syntax errors using tidy (if installed) or basic checks."""
    sp = _safe_path(file_path)
    if not sp or not os.path.isfile(sp):
        return f"error: file not found: {file_path}"
    tidy = _sh(f"which tidy 2>/dev/null", "/root")
    if "tidy" in tidy:
        return _sh(f"tidy -q -e '{sp}' 2>&1 | head -30", "/root")
    try:
        with open(sp, "r", errors="replace") as f:
            html = f.read()
        issues = []
        if "<html" not in html:
            issues.append("missing <html> tag")
        if "</html>" not in html:
            issues.append("missing </html> closing tag")
        if "<head" not in html:
            issues.append("missing <head> tag")
        if "<body" not in html:
            issues.append("missing <body> tag")
        unclosed = re.findall(r"<(img|br|hr|input|meta|link)(?![^>]*/>)", html)
        if unclosed:
            issues.append(f"potentially unclosed void elements: {unclosed[:5]}")
        return "\n".join(issues) if issues else "PASS: basic HTML structure valid"
    except Exception as e:
        return f"error: {e}"


@tool
def css_lint(file_path: str = "") -> str:
    """Lint CSS files using stylelint (if installed) or basic checks."""
    if file_path:
        sp = _safe_path(file_path)
        if not sp:
            return "error: path outside workspace"
        return _sh(f"npx stylelint '{sp}' 2>&1 | head -30", WORKSPACE, 30)
    return _sh("npx stylelint '**/*.css' --max-warnings 20 2>&1 | head -30", WORKSPACE, 60)


@tool
def sitemap_check(base_url: str = "https://daveai.tech") -> str:
    """Check if sitemap.xml exists and is valid. Also checks robots.txt."""
    results = []
    sitemap = _sh(f"curl -sL -o /dev/null -w '%{{http_code}}' {base_url}/sitemap.xml", "/root", 10)
    results.append(f"sitemap.xml: HTTP {sitemap}")
    robots = _sh(f"curl -sL -o /dev/null -w '%{{http_code}}' {base_url}/robots.txt", "/root", 10)
    results.append(f"robots.txt: HTTP {robots}")
    if sitemap.strip() == "200":
        content = _sh(f"curl -sL {base_url}/sitemap.xml | head -20", "/root", 10)
        results.append(f"sitemap preview:\n{content}")
    return "\n".join(results)


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Infrastructure Extended
# Inspired by: tailscale, ping-monitor, dns-networking, log-analyzer, log-tail,
#              system-monitor, sysadmin-toolbox, cron-creator, linux-service-triage
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def cron_add(schedule: str, command: str, label: str = "") -> str:
    """Add a cron job. schedule: e.g. '0 */6 * * *'. Appends to root crontab."""
    comment = f"# {label}" if label else ""
    entry = f"{schedule} {command} {comment}"
    existing = _sh("crontab -l 2>/dev/null || true", "/root")
    if command in existing:
        return "warning: similar cron entry already exists"
    return _sh(f'(crontab -l 2>/dev/null; echo "{entry}") | crontab -', "/root")


@tool
def cron_list() -> str:
    """List all root cron jobs."""
    return _sh("crontab -l 2>/dev/null || echo 'no crontab'", "/root")


@tool
def port_check(port: int, host: str = "127.0.0.1") -> str:
    """Check if a TCP port is open/listening."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3)
        result = s.connect_ex((host, int(port)))
        s.close()
        if result == 0:
            return f"OPEN: {host}:{port} is accepting connections"
        return f"CLOSED: {host}:{port} refused connection"
    except Exception as e:
        return f"error: {e}"


@tool
def dns_lookup(hostname: str) -> str:
    """Resolve hostname to IP addresses and check DNS records."""
    results = []
    results.append(_sh(f"dig +short {hostname} A 2>&1", "/root", 10))
    results.append(_sh(f"dig +short {hostname} AAAA 2>&1", "/root", 10))
    return f"DNS for {hostname}:\n" + "\n".join(results)


@tool
def log_tail(log_path: str, lines: int = 50) -> str:
    """Read last N lines of any log file. Sanitized path."""
    allowed_dirs = ["/var/log", "/opt/agent-brain", "/root/.pm2/logs"]
    rp = os.path.realpath(log_path)
    if not any(rp.startswith(d) for d in allowed_dirs):
        return f"error: access denied — only allowed: {allowed_dirs}"
    n = min(int(lines), 200)
    return _sh(f"tail -n {n} '{rp}' 2>&1", "/root")


@tool
def service_restart(service_name: str) -> str:
    """Restart a systemd service. Limited to known safe services."""
    allowed = ["nginx", "docker", "ssh", "fail2ban", "cron"]
    name = re.sub(r"[^a-zA-Z0-9_\-]", "", service_name)
    if name not in allowed:
        return f"error: only allowed services: {allowed}"
    return _sh(f"systemctl restart {name} 2>&1", "/root", 30)


@tool
def tailscale_status() -> str:
    """Show Tailscale VPN status including connected peers."""
    return _sh("tailscale status 2>&1 | head -20", "/root", 10)


@tool
def system_info() -> str:
    """Quick system diagnostics: CPU, memory, disk, uptime, load."""
    parts = [
        _sh("uptime 2>&1", "/root", 5),
        _sh("free -h | head -3 2>&1", "/root", 5),
        _sh("df -h / /var /opt 2>&1 | head -5", "/root", 5),
        _sh("nproc 2>&1", "/root", 5),
    ]
    return "\n---\n".join(parts)


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Assets Extended
# Inspired by: frontend-design, image-router, pollinations, google-fonts
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def font_download(font_name: str, weights: str = "400;700") -> str:
    """Download a Google Font CSS for self-hosting. Returns CSS import snippet."""
    encoded = font_name.replace(" ", "+")
    url = f"https://fonts.googleapis.com/css2?family={encoded}:wght@{weights}&display=swap"
    css = _sh(
        f"curl -sL -H 'User-Agent: Mozilla/5.0' '{url}' 2>&1 | head -60", "/root", 15,
    )
    if "font-face" in css:
        return f"/* Add to globals.css */\n@import url('{url}');\n\n/* Raw CSS: */\n{css}"
    return f"error: font not found or fetch failed for '{font_name}'"


@tool
def unsplash_search(query: str, count: int = 5) -> str:
    """Search Unsplash for free stock images. Returns URLs (no API key, uses source redirect)."""
    results = []
    for i in range(min(int(count), 10)):
        encoded = query.replace(" ", "+")
        results.append(f"https://source.unsplash.com/800x600/?{encoded}&sig={i}")
    return "Unsplash image URLs (free, no attribution required for web):\n" + "\n".join(results)


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: AI / LLM Extended
# Inspired by: adversarial-prompting, clean-code, computer-vision-expert,
#              prompt-engineering-expert, llm-council, tdd-guide, test-runner
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def llm_fix_code(file_path: str, error_message: str = "") -> str:
    """Ask LLM to fix a broken code file. Reads the file, sends to LLM with error context."""
    sp = _safe_path(file_path)
    if not sp or not os.path.isfile(sp):
        return f"error: file not found: {file_path}"
    try:
        with open(sp, "r", errors="replace") as f:
            code = f.read()[:8000]
    except Exception as e:
        return f"error reading file: {e}"
    prompt = f"Fix this code. Error: {error_message}\n\nCode:\n```\n{code}\n```\n\nReturn ONLY the fixed code."
    return _llm(prompt, system="You are a senior developer. Fix the code and return only the corrected version.", model=HEAVY)


@tool
def llm_write_test(file_path: str, framework: str = "playwright") -> str:
    """Generate a test file for a given component/page using LLM."""
    sp = _safe_path(file_path)
    if not sp or not os.path.isfile(sp):
        return f"error: file not found: {file_path}"
    try:
        with open(sp, "r", errors="replace") as f:
            code = f.read()[:6000]
    except Exception as e:
        return f"error reading file: {e}"
    prompt = (
        f"Write a {framework} test for this component/page:\n```\n{code}\n```\n"
        f"Return a complete test file ready to run."
    )
    return _llm(prompt, system=f"You are a QA engineer. Write {framework} tests.")


@tool
def llm_tailwind_suggest(description: str) -> str:
    """Suggest Tailwind CSS classes for a UI element description."""
    prompt = f"Suggest Tailwind CSS classes for: {description}\nReturn className string only."
    return _llm(prompt, system="You are a Tailwind CSS expert. Return only the className string.")


@tool
def image_generate(prompt: str, provider: str = "pollinations") -> str:
    """Generate an image URL from a text prompt using free providers."""
    if provider == "pollinations":
        encoded = prompt.replace(" ", "+")[:200]
        url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=768&nologo=true"
        return f"Generated image URL:\n{url}\n\nUse image_download to save locally."
    return "error: unsupported provider. Use 'pollinations' (free, no API key)."


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Communication Extended
# Inspired by: slack, discord, smtp-send, webhook
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def slack_send(message: str, webhook_url: str = "") -> str:
    """Send a message to Slack via incoming webhook. Set SLACK_WEBHOOK_URL env or pass directly."""
    url = webhook_url or os.getenv("SLACK_WEBHOOK_URL", "")
    if not url:
        return "error: no Slack webhook URL. Set SLACK_WEBHOOK_URL env var."
    payload = json.dumps({"text": message[:3000]})
    return _sh(
        f"curl -sS -X POST -H 'Content-Type: application/json' -d '{payload}' '{url}'",
        "/root", 15,
    )


@tool
def discord_send(message: str, webhook_url: str = "") -> str:
    """Send a message to Discord via webhook. Set DISCORD_WEBHOOK_URL env or pass directly."""
    url = webhook_url or os.getenv("DISCORD_WEBHOOK_URL", "")
    if not url:
        return "error: no Discord webhook URL. Set DISCORD_WEBHOOK_URL env var."
    payload = json.dumps({"content": message[:2000]})
    return _sh(
        f"curl -sS -X POST -H 'Content-Type: application/json' -d '{payload}' '{url}'",
        "/root", 15,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Database
# Inspired by: sql-toolkit, database-operations, db-query, knowledge-base
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def db_query(sql: str, db_path: str = "") -> str:
    """Run a read-only SQL query on the DaveAI SQLite database. SELECT only."""
    path = db_path or DB_PATH
    if not os.path.isfile(path):
        return f"error: database not found at {path}"
    cleaned = sql.strip().rstrip(";")
    if not cleaned.upper().startswith("SELECT"):
        return "error: only SELECT queries allowed for safety"
    try:
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        cur = conn.execute(cleaned)
        rows = cur.fetchmany(100)
        if not rows:
            return "no results"
        cols = rows[0].keys()
        result = " | ".join(cols) + "\n" + "-" * 40 + "\n"
        for row in rows:
            result += " | ".join(str(row[c]) for c in cols) + "\n"
        conn.close()
        return result[:4000]
    except Exception as e:
        return f"error: {e}"


@tool
def db_backup(db_path: str = "") -> str:
    """Create a timestamped backup of the SQLite database."""
    path = db_path or DB_PATH
    if not os.path.isfile(path):
        return f"error: database not found at {path}"
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = f"{BACKUP_DIR}/daveai-db-{ts}.sqlite"
    _sh(f"mkdir -p {BACKUP_DIR}", "/root")
    return _sh(f"cp '{path}' '{dest}' && echo 'backed up to {dest}'", "/root")


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: SEO
# Inspired by: package-seo, seo-article-gen, keywords-everywhere, ga4-analytics,
#              geo-optimization, schema-markup
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def sitemap_generate(base_url: str = "https://daveai.tech") -> str:
    """Generate a basic sitemap.xml from the built output directory."""
    out_dir = os.path.join(WORKSPACE, "out")
    if not os.path.isdir(out_dir):
        out_dir = os.path.join(WORKSPACE, ".next", "server", "pages")
    if not os.path.isdir(out_dir):
        return "error: no output directory found (out/ or .next/server/pages/)"
    pages = []
    for root, dirs, files in os.walk(out_dir):
        for f in files:
            if f.endswith(".html"):
                rel = os.path.relpath(os.path.join(root, f), out_dir)
                path = rel.replace("\\", "/").replace("index.html", "").rstrip("/")
                pages.append(f"  <url><loc>{base_url}/{path}</loc></url>")
    if not pages:
        return "warning: no HTML files found in output directory"
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(pages[:500]) +
        "\n</urlset>"
    )
    dest = os.path.join(WORKSPACE, "public", "sitemap.xml")
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w") as f:
            f.write(sitemap)
        return f"wrote {len(pages)} URLs to {dest}"
    except Exception as e:
        return f"error: {e}"


@tool
def robots_write(extra_rules: str = "") -> str:
    """Write a robots.txt file for the workspace with sensible defaults."""
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /_next/\n"
        f"Sitemap: https://daveai.tech/sitemap.xml\n"
    )
    if extra_rules:
        content += "\n" + extra_rules + "\n"
    dest = os.path.join(WORKSPACE, "public", "robots.txt")
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w") as f:
            f.write(content)
        return f"wrote robots.txt to {dest}"
    except Exception as e:
        return f"error: {e}"


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Security Extended
# Inspired by: ggshield-scanner, flaw0, crawsecure, security-sentinel,
#              secure-install, skill-vetting, shell-security-ultimate, sandwrap,
#              safe-exec, openguardrails, clawdefender
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def secret_scan(path: str = "") -> str:
    """Scan workspace for hardcoded secrets, API keys, passwords in source files."""
    target = path or WORKSPACE
    patterns = [
        r"(?i)(api[_-]?key|apikey)\s*[=:]\s*['\"][a-zA-Z0-9]{16,}",
        r"(?i)(secret|password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{8,}",
        r"(?i)(token)\s*[=:]\s*['\"][a-zA-Z0-9_\-]{20,}",
        r"sk-[a-zA-Z0-9]{20,}",
        r"ghp_[a-zA-Z0-9]{36}",
        r"-----BEGIN (RSA |EC )?PRIVATE KEY-----",
    ]
    results = []
    for pat in patterns:
        out = _sh(
            f"grep -rnI --include='*.py' --include='*.js' --include='*.ts' "
            f"--include='*.tsx' --include='*.env*' --include='*.yaml' --include='*.yml' "
            f"-E '{pat}' '{target}' 2>/dev/null | head -10",
            "/root", 15,
        )
        if out and out != "done":
            results.append(out)
    if results:
        return "⚠ POTENTIAL SECRETS FOUND:\n" + "\n---\n".join(results)
    return "PASS: no hardcoded secrets detected"


@tool
def workspace_reset() -> str:
    """Emergency: discard all uncommitted changes and reset to last commit.
    Creates a stash backup first for recovery."""
    stash = _sh("git stash push -m 'emergency-reset-backup'")
    clean = _sh("git checkout -- . && git clean -fd 2>&1")
    return f"stash: {stash}\nreset: {clean}\n\nTo recover: git stash pop"


@tool
def input_sanitize(text: str) -> str:
    """Sanitize user input — strip dangerous shell chars, HTML tags, injection patterns."""
    sanitized = text
    sanitized = re.sub(r"[;&|`$(){}]", "", sanitized)
    sanitized = re.sub(r"<script[^>]*>.*?</script>", "", sanitized, flags=re.IGNORECASE | re.DOTALL)
    sanitized = re.sub(r"<[^>]+>", "", sanitized)
    sanitized = re.sub(r"(--|;|UNION\s+SELECT|DROP\s+TABLE|INSERT\s+INTO)", "", sanitized, flags=re.IGNORECASE)
    return sanitized[:2000]


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY: Visual QA + Assets (SOTA Phase 3)
# New skills wiring brain_visual_qa.py, brain_assets.py, brain_openhands.py
# ═══════════════════════════════════════════════════════════════════════════════

@tool
def visual_qa_loop(url: str, site_name: str = "main") -> str:
    """
    Run visual QA: Playwright screenshot → Gemini Vision critique → targeted fix loop.
    Max 5 iterations. Returns JSON with score, issues_fixed, passed.

    Args:
        url:       URL to QA (e.g. "http://localhost:3001")
        site_name: Name prefix for screenshot files
    """
    try:
        from brain_visual_qa import visual_qa_loop as _vqa_loop
        result = _vqa_loop(url, site_name)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"error: {e}"


@tool
def lighthouse_audit(url: str) -> str:
    """
    Run Lighthouse performance/accessibility/SEO audit.
    Returns JSON with scores for performance, accessibility, best_practices, seo.

    Args:
        url: URL to audit (e.g. "http://localhost:3001")
    """
    try:
        from brain_visual_qa import lighthouse_score
        result = lighthouse_score(url)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"error: {e}"


@tool
def generate_image(prompt: str, width: int = 1200, height: int = 630, filename: str = "") -> str:
    """
    Generate an image: Stable Diffusion → Unsplash → SVG placeholder.
    Saves to /public/assets/generated/. Returns JSON with path and source.

    Args:
        prompt:   Text prompt describing the image
        width:    Image width in pixels (default 1200)
        height:   Image height in pixels (default 630)
        filename: Optional output filename (auto-generated if empty)
    """
    try:
        from brain_assets import generate_image as _gen
        result = _gen(prompt, width, height, filename or None)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"error: {e}"


@tool
def fetch_icon(icon_id: str, size: int = 24, color: str = "currentColor") -> str:
    """
    Fetch an SVG icon: Iconify CDN → Heroicons → inline SVG fallback.
    Returns raw SVG string.

    Args:
        icon_id: Iconify format "prefix:name" e.g. "heroicons:star-solid"
        size:    Icon size in pixels (default 24)
        color:   Fill/stroke color (default "currentColor")
    """
    try:
        from brain_assets import fetch_icon as _fetch
        return _fetch(icon_id, size, color)
    except Exception as e:
        return f"error: {e}"


@tool
def save_icon(icon_id: str, dest_path: str, size: int = 24) -> str:
    """
    Fetch an icon and save it to a file in the workspace.

    Args:
        icon_id:   Iconify format "prefix:name" e.g. "heroicons:star-solid"
        dest_path: Destination path relative to workspace (e.g. "public/icons/star.svg")
        size:      Icon size in pixels
    """
    try:
        from brain_assets import save_icon_to_file
        return save_icon_to_file(icon_id, dest_path, size)
    except Exception as e:
        return f"error: {e}"


@tool
def get_font_url(families: str, weights: str = "400,700") -> str:
    """
    Build a Google Fonts CSS2 URL (no API key required).

    Args:
        families: Comma-separated font names e.g. "Inter,Playfair Display"
        weights:  Comma-separated weights e.g. "300,400,700"

    Returns:
        Google Fonts URL string
    """
    try:
        from brain_assets import get_google_font_url
        fam_list = [f.strip() for f in families.split(",")]
        wt_list  = [int(w.strip()) for w in weights.split(",")]
        return get_google_font_url(fam_list, wt_list)
    except Exception as e:
        return f"error: {e}"


@tool
def optimize_image_file(src_path: str, quality: int = 85) -> str:
    """
    Optimize an image to WebP: sharp (Node) → Pillow (Python) → copy as-is.
    Returns JSON with original_kb, optimized_kb, and output path.

    Args:
        src_path: Path relative to workspace (e.g. "public/hero.jpg")
        quality:  WebP quality 1-100 (default 85)
    """
    try:
        from brain_assets import optimize_image
        result = optimize_image(src_path, quality)
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"error: {e}"


@tool
def openhands_task(description: str, files: str = "", constraints: str = "") -> str:
    """
    Send a complex coding task to OpenHands Docker agent.
    Uses triple failsafe: OpenHands API → ZeroClaw shell → structured plan.
    Best for tasks touching 3+ files or requiring refactoring.

    Args:
        description:  What to build or change
        files:        Comma-separated list of files to modify (optional)
        constraints:  Any specific rules or constraints (optional)
    """
    try:
        from brain_openhands import openhands_execute, should_use_openhands
        task = {
            "description": description,
            "files": [f.strip() for f in files.split(",") if f.strip()],
            "constraints": constraints,
            "type": "multi_file",
        }
        lines = []
        for event in openhands_execute(task):
            lines.append(event)
        return "\n".join(lines)
    except Exception as e:
        return f"error: {e}"


@tool
def openhands_health_check() -> str:
    """Check if OpenHands Docker agent is available and healthy."""
    try:
        from brain_openhands import openhands_health
        result = openhands_health()
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"error: {e}"


@tool
def deploy_to_staging() -> str:
    """
    Deploy current workspace to staging environment (port 3002).
    Runs: rsync → npm build → PM2 reload staging-ui.
    Returns JSON with status and build output.
    """
    try:
        from brain_deploy import deploy_staging
        result = deploy_staging()
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"error: {e}"


@tool
def full_blue_green_deploy() -> str:
    """
    Full blue/green deployment: staging → health check → production.
    Triple failsafe: blue/green → PM2 reload → git rollback.
    Sends Telegram notification on completion.
    Returns JSON with status, git_hash, duration_s.
    """
    try:
        from brain_deploy import full_deploy
        result = full_deploy()
        return json.dumps(result, indent=2)
    except Exception as e:
        return f"error: {e}"
