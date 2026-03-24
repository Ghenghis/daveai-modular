"""DaveAI Agent Skills — Part 1 (File/Git/ZeroClaw/Build/QA/Code/Assets)"""
import os, subprocess, json, shutil, time, re
import urllib.request, urllib.parse, urllib.error
from datetime import datetime
from langchain_core.tools import tool
from dotenv import load_dotenv

load_dotenv()

WORKSPACE    = os.getenv("WORKSPACE",    "/var/www/agentic-website")
ZEROCLAW_URL = os.getenv("ZEROCLAW_URL", "http://127.0.0.1:3000")
# BRAIN_URL: brain's own REST API (port 8888) — used by tool proxy endpoints
# /tools/shell/run, /tools/file/write, /tools/file/read, /tools/file/list
BRAIN_URL    = os.getenv("BRAIN_URL",    "http://127.0.0.1:8888")
LLM_BASE     = os.getenv("LITELLM_URL",  "http://127.0.0.1:4000/v1")
FAST         = os.getenv("FAST_MODEL",   "fast-agent")
VAULT_PATH   = "/opt/agent-brain/keyvault.json"
SCREENSHOT_DIR = "/opt/agent-brain/screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

SKIP_DIRS = {".git","node_modules",".next","__pycache__",".turbo","dist","build"}

def _sh(cmd, cwd=WORKSPACE, timeout=120):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        return (r.stdout.strip() or r.stderr.strip() or "done")[:2000]
    except subprocess.TimeoutExpired: return "error: timed out"
    except Exception as e: return f"error: {e}"

def _vault():
    try:
        with open(VAULT_PATH) as f: return json.load(f)
    except: return {}

def _zc(ep, body, timeout=60):
    """Call brain's REST tool proxy endpoints (/tools/*) on BRAIN_URL:8888."""
    try:
        data = json.dumps(body).encode()
        req = urllib.request.Request(f"{BRAIN_URL}{ep}", data=data, headers={"Content-Type":"application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read())
    except Exception as e: return {"error": str(e)}

def _pw(script, timeout=50):
    code = f"from playwright.sync_api import sync_playwright\n{script}"
    r = subprocess.run(["/opt/agent-brain/venv/bin/python3","-c",code], capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip() or r.stderr.strip() or "done"

# ── FILE SYSTEM ───────────────────────────────────────────────────────────────

@tool
def directory_list(path: str = "", depth: int = 3) -> str:
    """List workspace as a directory tree. path is relative to workspace root."""
    full = os.path.join(WORKSPACE, path) if path else WORKSPACE
    if not os.path.exists(full): return f"not found: {full}"
    lines = []
    for root, dirs, files in os.walk(full):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        lv = root.replace(full,"").count(os.sep)
        if lv > depth: continue
        ind = "  "*lv
        lines.append(f"{ind}{os.path.basename(root) or '.'}/")
        for f in sorted(files):
            sz = os.path.getsize(os.path.join(root,f))//1024
            lines.append(f"{ind}  {f}  ({sz}KB)")
    return "\n".join(lines[:200]) or "empty"

@tool
def file_delete(path: str) -> str:
    """Delete a file from the workspace (forbidden for /opt paths)."""
    full = path if os.path.isabs(path) else os.path.join(WORKSPACE, path)
    if any(s in full for s in ["/opt/agent-brain","/opt/litellm","/etc/nginx"]): return "error: forbidden"
    try: os.remove(full); return f"deleted: {full}"
    except Exception as e: return f"error: {e}"

@tool
def file_move(src: str, dst: str) -> str:
    """Move or rename a file within the workspace."""
    s = src if os.path.isabs(src) else os.path.join(WORKSPACE, src)
    d = dst if os.path.isabs(dst) else os.path.join(WORKSPACE, dst)
    try: os.makedirs(os.path.dirname(d), exist_ok=True); shutil.move(s,d); return f"moved: {s} -> {d}"
    except Exception as e: return f"error: {e}"

@tool
def file_append(path: str, content: str) -> str:
    """Append content to a file in the workspace."""
    full = path if os.path.isabs(path) else os.path.join(WORKSPACE, path)
    try:
        with open(full,"a",encoding="utf-8") as f: f.write("\n"+content)
        return f"appended to {full}"
    except Exception as e: return f"error: {e}"

@tool
def grep_workspace(pattern: str, extension: str = "") -> str:
    """Search for text pattern across workspace files. extension: e.g. 'tsx'"""
    inc = f'--include="*.{extension}"' if extension else '--include="*.ts" --include="*.tsx" --include="*.js" --include="*.html" --include="*.css"'
    return _sh(f'grep -rn {inc} "{pattern}" . 2>/dev/null | head -25', WORKSPACE, 20) or f"No matches for '{pattern}'"

@tool
def find_files(name_pattern: str = "", extension: str = "") -> str:
    """Find files in workspace by name or extension."""
    f = f'-name "*.{extension}"' if extension else f'-name "*{name_pattern}*"'
    return _sh(f'find . {f} -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.next/*" | head -30', WORKSPACE, 20)

# ── GIT ───────────────────────────────────────────────────────────────────────

@tool
def git_diff(staged: bool = False) -> str:
    """Show git diff. staged=True for staged-only."""
    f = "--cached" if staged else ""
    return _sh(f"git diff {f} --stat && git diff {f} | head -80", WORKSPACE)

@tool
def git_push(remote: str = "origin", branch: str = "main") -> str:
    """Push to remote (uses gitlab_token from vault if configured)."""
    v = _vault(); token = v.get("gitlab_token",""); base = v.get("gitlab_url","")
    if token and base:
        parsed = base.replace("http://","").replace("https://","")
        scheme = "https" if base.startswith("https") else "http"
        _sh(f'git remote set-url {remote} {scheme}://oauth2:{token}@{parsed}.git 2>/dev/null || true', WORKSPACE)
    return _sh(f"git push {remote} {branch} 2>&1", WORKSPACE)

@tool
def git_pull(remote: str = "origin", branch: str = "main") -> str:
    """Pull latest from remote."""
    return _sh(f"git pull {remote} {branch} 2>&1", WORKSPACE)

@tool
def git_branch_create(branch_name: str) -> str:
    """Create and switch to a new git branch."""
    return _sh(f"git checkout -b {branch_name} 2>&1", WORKSPACE)

@tool
def git_branch_list() -> str:
    """List all local and remote branches."""
    return _sh("git branch -a 2>&1", WORKSPACE)

@tool
def git_stash(message: str = "wip") -> str:
    """Stash changes. Pass 'pop' to restore."""
    if message.lower() == "pop": return _sh("git stash pop 2>&1", WORKSPACE)
    return _sh(f'git stash push -m "{message}" 2>&1', WORKSPACE)

@tool
def git_tag(tag_name: str, message: str = "") -> str:
    """Create an annotated git tag."""
    return _sh(f'git tag -a {tag_name} -m "{message or tag_name}" 2>&1', WORKSPACE)

@tool
def git_backup(commit_message: str = "") -> str:
    """Stage all, commit, and push to remote GitLab backup."""
    msg = (commit_message or f"backup: {datetime.now().strftime('%Y-%m-%d %H:%M')}").replace('"',"'")[:72]
    _sh(f'git add -A && git commit -m "{msg}" 2>&1 || true', WORKSPACE)
    return git_push.invoke({"remote":"origin","branch":"main"})

# ── ZEROCLAW ──────────────────────────────────────────────────────────────────

@tool
def zeroclaw_status() -> str:
    """Check ZeroClaw daemon health."""
    try:
        with urllib.request.urlopen(f"{ZEROCLAW_URL}/health", timeout=5) as r:
            return json.dumps(json.loads(r.read()), indent=2)
    except Exception as e: return f"ZeroClaw unreachable: {e}"

@tool
def zeroclaw_shell(command: str) -> str:
    """Run a shell command through ZeroClaw's sandboxed executor."""
    return _zc("/tools/shell/run", {"command":command,"workspace":WORKSPACE}).get("output","no output")[:2000]

@tool
def zeroclaw_file_write(path: str, content: str) -> str:
    """Write a file through ZeroClaw (respects security policy)."""
    return _zc("/tools/file/write", {"path":path,"content":content}).get("message","written")

@tool
def zeroclaw_file_read(path: str) -> str:
    """Read a file through ZeroClaw."""
    return _zc("/tools/file/read", {"path":path}).get("content","")[:4000]

@tool
def zeroclaw_workspace_tree() -> str:
    """Get workspace file tree through ZeroClaw API."""
    r = _zc("/tools/file/list", {"path":WORKSPACE,"recursive":True,"depth":4})
    return json.dumps(r,indent=2)[:3000]

@tool
def zeroclaw_http_get(url: str) -> str:
    """Make HTTP GET through ZeroClaw."""
    return _zc("/tools/http/get", {"url":url}).get("body","")[:3000]

@tool
def zeroclaw_http_post(url: str, body: str) -> str:
    """Make HTTP POST through ZeroClaw."""
    return _zc("/tools/http/post", {"url":url,"body":body,"content_type":"application/json"}).get("body","")[:2000]

# ── BUILD & DEPLOY ────────────────────────────────────────────────────────────

@tool
def npm_run(script: str, cwd: str = "") -> str:
    """Run an npm script (build/dev/test/lint/etc)."""
    return _sh(f"npm run {script} 2>&1 | tail -30", cwd or WORKSPACE, 180)

@tool
def npm_build(cwd: str = "") -> str:
    """Run npm run build. Returns [BUILD OK/FAILED] + last 40 lines."""
    out = _sh("npm run build 2>&1 | tail -40", cwd or WORKSPACE, 300)
    ok = "compiled successfully" in out.lower() or "route (app)" in out.lower()
    fail = "build failed" in out.lower()
    tag = "[BUILD OK]" if ok else ("[BUILD FAILED]" if fail else "[BUILD DONE]")
    return f"{tag}\n{out}"

@tool
def npm_audit(fix: bool = False) -> str:
    """Run npm security audit. fix=True to auto-fix vulnerabilities."""
    if fix:
        return _sh("npm audit fix 2>&1 | tail -15", WORKSPACE, 60)
    return _sh("npm audit 2>&1 | tail -15", WORKSPACE, 60)

@tool
def pm2_status() -> str:
    """Get all PM2 process statuses."""
    return _sh("pm2 list 2>&1 | tail -20", "/root", 15)

@tool
def pm2_restart(process_name: str) -> str:
    """Restart a PM2 process and confirm it comes back online."""
    out = _sh(f"pm2 restart {process_name} 2>&1", "/root", 20)
    time.sleep(4)
    status = _sh(f"pm2 show {process_name} 2>&1 | grep status | head -2", "/root")
    return f"{out}\n{status}"

@tool
def pm2_logs(process_name: str, lines: int = 30) -> str:
    """Read recent PM2 logs for a process."""
    return _sh(f"pm2 logs {process_name} --lines {lines} --nostream 2>&1 | tail -{lines}", "/root", 15)

@tool
def service_health(url: str, expected_text: str = "") -> str:
    """HTTP health-check a service URL."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent":"DaveAI-Agent/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read(2000).decode(errors="replace")
            ok = (expected_text in body) if expected_text else True
            return f"HTTP {r.status} {'OK' if ok else 'MISMATCH'}\n{body[:300]}"
    except urllib.error.HTTPError as e: return f"HTTP {e.code}"
    except Exception as e: return f"unreachable: {e}"

@tool
def nginx_test() -> str:
    """Test Nginx configuration validity."""
    return _sh("nginx -t 2>&1", "/root")

@tool
def nginx_reload() -> str:
    """Reload Nginx config (tests first, no downtime)."""
    t = _sh("nginx -t 2>&1", "/root")
    if "successful" not in t.lower(): return f"Config invalid:\n{t}"
    return _sh("systemctl reload nginx 2>&1 || nginx -s reload 2>&1", "/root")

@tool
def docker_status() -> str:
    """List running Docker containers."""
    return _sh("docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>&1", "/root")

@tool
def docker_restart(container_name: str) -> str:
    """Restart a Docker container by name."""
    return _sh(f"docker restart {container_name} 2>&1", "/root", 30)

@tool
def litellm_status() -> str:
    """Check LiteLLM proxy health and loaded models."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:4000/v1/models", timeout=8) as r:
            models = [m["id"] for m in json.loads(r.read()).get("data",[])]
        return f"LiteLLM OK | {models}"
    except Exception as e: return f"LiteLLM unreachable: {e}"

# ── QA / TESTING ──────────────────────────────────────────────────────────────

@tool
def playwright_screenshot(url: str = "http://127.0.0.1:3001", filename: str = "") -> str:
    """Take a full-page screenshot via Playwright."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = f"{SCREENSHOT_DIR}/{filename or f'shot-{ts}.png'}"
    return _pw(f"""
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page(viewport={{"width":1280,"height":800}})
    pg.goto("{url}",timeout=20000,wait_until="networkidle")
    pg.screenshot(path="{out}",full_page=True)
    t=pg.title(); br.close(); print(f"saved:{out} title:{{t}}")
""", 40)

@tool
def mobile_screenshot(url: str = "http://127.0.0.1:3001", filename: str = "") -> str:
    """Screenshot at iPhone 14 mobile viewport (390x844)."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = f"{SCREENSHOT_DIR}/{filename or f'mobile-{ts}.png'}"
    return _pw(f"""
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page(viewport={{"width":390,"height":844}})
    pg.goto("{url}",timeout=20000,wait_until="networkidle")
    pg.screenshot(path="{out}",full_page=True); br.close(); print(f"saved:{out}")
""", 40)

@tool
def playwright_test_run(test_file: str = "") -> str:
    """Run Playwright E2E tests and return summary."""
    return _sh(f"npx playwright test {test_file} --reporter=line 2>&1 | tail -20", WORKSPACE, 120)

@tool
def lighthouse_audit(url: str = "http://127.0.0.1:3001") -> str:
    """Run Lighthouse audit (perf/accessibility/SEO)."""
    return _sh(f'npx lighthouse {url} --output=json --quiet --chrome-flags="--headless --no-sandbox" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);[print(f\'{{k}}: {{int(v[\\\"score\\\"]*100)}}/100\') for k,v in d.get(\'categories\',{{}}).items()]"', WORKSPACE, 90) or "install: npm i -g lighthouse"

# ── CODE QUALITY ──────────────────────────────────────────────────────────────

@tool
def eslint_run(path: str = ".", fix: bool = False) -> str:
    """Run ESLint. fix=True to auto-fix."""
    return _sh(f"npx eslint {path} {'--fix' if fix else ''} --format=compact 2>&1 | head -30", WORKSPACE, 60) or "No ESLint issues"

@tool
def prettier_format(path: str = ".") -> str:
    """Format code with Prettier in place."""
    return _sh(f'npx prettier --write "{path}" 2>&1 | tail -10', WORKSPACE, 60)

@tool
def typescript_check() -> str:
    """TypeScript type check (tsc --noEmit)."""
    return _sh("npx tsc --noEmit 2>&1 | head -30", WORKSPACE, 60) or "TypeScript: no errors"

@tool
def security_scan() -> str:
    """Scan workspace for hardcoded secrets/API keys."""
    out = _sh('grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.py" -E "(sk-[a-zA-Z0-9]{20,}|glpat-[a-zA-Z0-9]{20,}|PRIVATE KEY)" . 2>/dev/null | grep -v node_modules | grep -v .git | head -10', WORKSPACE, 15)
    return out or "No secrets found"

# ── WEB RESEARCH & ASSETS ─────────────────────────────────────────────────────

@tool
def url_fetch(url: str) -> str:
    """Fetch a web page and return its text content."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0 DaveAI/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read(60000).decode(errors="replace")
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>"," ",raw)).strip()[:3000]
    except Exception as e: return f"fetch error: {e}"

@tool
def image_download(url: str, filename: str = "") -> str:
    """Download an image into workspace /public/assets/."""
    assets = os.path.join(WORKSPACE, "public", "assets")
    os.makedirs(assets, exist_ok=True)
    fname = filename or url.split("/")[-1].split("?")[0] or "image.jpg"
    dest = os.path.join(assets, fname)
    try:
        req = urllib.request.Request(url, headers={"User-Agent":"DaveAI/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            with open(dest,"wb") as f: f.write(r.read(10_000_000))
        return f"Downloaded {fname} ({os.path.getsize(dest)//1024}KB) -> {dest}"
    except Exception as e: return f"error: {e}"

@tool
def icon_get(icon_name: str, library: str = "lucide") -> str:
    """Get an SVG icon from Lucide or Heroicons."""
    if library == "lucide":
        url = f"https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/{icon_name}.svg"
    else:
        url = f"https://raw.githubusercontent.com/tailwindlabs/heroicons/master/src/24/outline/{icon_name}.svg"
    try:
        with urllib.request.urlopen(url, timeout=10) as r: return r.read().decode()[:2000]
    except Exception as e: return f"Icon '{icon_name}' not found in {library}: {e}"

@tool
def npm_search(query: str) -> str:
    """Search npm registry for packages."""
    url = f"https://registry.npmjs.org/-/v1/search?text={urllib.parse.quote(query)}&size=8"
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            pkgs = json.loads(r.read()).get("objects",[])
        return "\n".join(f"{p['package']['name']} v{p['package'].get('version','?')} — {p['package'].get('description','')[:80]}" for p in pkgs) or "No results"
    except Exception as e: return f"npm search error: {e}"

@tool
def disk_usage() -> str:
    """Check VPS disk space usage."""
    return _sh("df -h / /var /opt 2>/dev/null | head -6", "/root")

@tool
def memory_usage() -> str:
    """Check VPS RAM and CPU usage."""
    return _sh("free -h && echo '---' && top -bn1 | head -5", "/root")

@tool
def nginx_logs_read(lines: int = 30, log_type: str = "error") -> str:
    """Read recent Nginx logs. log_type: 'error' or 'access'."""
    return _sh(f"tail -{lines} /var/log/nginx/{log_type}.log 2>/dev/null || echo 'log not found'", "/root")

@tool
def file_patch(file_path: str, search: str, replace: str) -> str:
    """Surgically replace one occurrence of 'search' with 'replace' in a workspace file.
    Safer than full file rewrite for small targeted edits. Returns confirmation or error."""
    import os as _os
    try:
        abs_path = file_path if file_path.startswith("/") else f"/var/www/agentic-website/{file_path}"
        if not _os.path.exists(abs_path):
            return f"Error: file not found: {abs_path}"
        with open(abs_path, "r", encoding="utf-8") as f:
            content = f.read()
        if search not in content:
            return f"Error: search string not found in {abs_path}"
        count = content.count(search)
        if count > 1:
            return f"Error: search string found {count} times — be more specific to avoid unintended replacements"
        new_content = content.replace(search, replace, 1)
        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        return f"OK: patched {abs_path} (replaced 1 occurrence, {len(content)} -> {len(new_content)} bytes)"
    except Exception as e:
        return f"file_patch error: {e}"

@tool
def web_search(query: str, max_results: int = 5) -> str:
    """Search the web using DuckDuckGo for docs, examples, or research. Returns titles + snippets."""
    try:
        import urllib.request, urllib.parse, json as _json, re as _re
        q = urllib.parse.quote_plus(query)
        url = f"https://api.duckduckgo.com/?q={q}&format=json&no_redirect=1&no_html=1"
        req = urllib.request.Request(url, headers={"User-Agent": "DaveAI-Agent/4.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = _json.loads(r.read().decode())
        results = []
        if data.get("AbstractText"):
            results.append(f"[Summary] {data['AbstractText'][:300]}")
        for rel in data.get("RelatedTopics", [])[:max_results]:
            if isinstance(rel, dict) and rel.get("Text"):
                url_hint = rel.get("FirstURL", "")
                results.append(f"• {rel['Text'][:200]}\n  {url_hint}")
        return "\n\n".join(results) if results else f"No results for: {query}"
    except Exception as e:
        return f"web_search error: {e}"

@tool
def url_screenshot(url: str, filename: str = "") -> str:
    """Take a Playwright screenshot of a URL and save it to the workspace screenshots folder.
    Returns the saved path or an error message."""
    import os as _os
    try:
        from playwright.sync_api import sync_playwright
        ss_dir = "/var/www/agentic-website/public/screenshots"
        _os.makedirs(ss_dir, exist_ok=True)
        if not filename:
            import re as _re, time as _t
            safe = _re.sub(r"[^a-z0-9]", "_", url.lower())[:40]
            filename = f"{safe}_{int(_t.time())}.png"
        out_path = f"{ss_dir}/{filename}"
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(url, timeout=20000, wait_until="networkidle")
            page.screenshot(path=out_path, full_page=False)
            browser.close()
        return f"OK: screenshot saved to {out_path} (public at /screenshots/{filename})"
    except ImportError:
        return "Error: playwright not installed — run: pip install playwright && playwright install chromium"
    except Exception as e:
        return f"url_screenshot error: {e}"

@tool
def process_list(filter_name: str = "") -> str:
    """List running processes on the VPS. Optionally filter by name substring."""
    if filter_name:
        cmd = f"ps aux --no-header | grep -i '{filter_name}' | grep -v grep | head -20"
    else:
        cmd = "ps aux --no-header --sort=-%cpu | head -20"
    return _sh(cmd, "/root")

@tool
def template_apply(template_name: str, target_path: str) -> str:
    """Copy a pre-built page template into the workspace. Templates are in /opt/agent-brain/templates/.
    template_name: e.g. 'hero', 'contact', 'portfolio', 'navbar'.
    target_path: relative path in workspace, e.g. 'components/Hero.tsx'."""
    import os as _os, shutil as _sh2
    try:
        templates_dir = "/opt/agent-brain/templates"
        workspace = "/var/www/agentic-website"
        src = _os.path.join(templates_dir, f"{template_name}.tsx")
        if not _os.path.exists(src):
            # List available templates
            if _os.path.isdir(templates_dir):
                avail = [f.replace(".tsx","") for f in _os.listdir(templates_dir) if f.endswith(".tsx")]
            else:
                avail = []
            return f"Template '{template_name}' not found. Available: {avail or 'none (templates dir empty)'}"
        dest = _os.path.join(workspace, target_path)
        _os.makedirs(_os.path.dirname(dest), exist_ok=True)
        _sh2.copy2(src, dest)
        return f"OK: template '{template_name}' copied to {dest}"
    except Exception as e:
        return f"template_apply error: {e}"
