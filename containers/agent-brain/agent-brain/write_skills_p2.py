"""Writes the fixed agent_skills_p2.py"""
content = '''"""DaveAI Agent Skills — Part 2 (AI/Vision, Components, Infra, Comms + Registry)"""
import os, subprocess, json, sqlite3, smtplib
import urllib.request, urllib.parse
from datetime import datetime
from email.mime.text import MIMEText
from langchain_core.tools import tool
from dotenv import load_dotenv

load_dotenv()

WORKSPACE    = os.getenv("WORKSPACE",    "/var/www/agentic-website")
LLM_BASE     = os.getenv("LITELLM_URL",  "http://127.0.0.1:4000/v1")
FAST         = os.getenv("FAST_MODEL",   "fast-agent")
HEAVY        = os.getenv("HEAVY_MODEL",  "heavy-coder")
VISION_MODEL = os.getenv("VISION_MODEL", "fast-agent")
DB_PATH      = "/opt/agent-brain/daveai.db"
SCREENSHOT_DIR = "/opt/agent-brain/screenshots"

def _sh(cmd, cwd=WORKSPACE, timeout=120):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        return (r.stdout.strip() or r.stderr.strip() or "done")[:2000]
    except subprocess.TimeoutExpired: return "error: timed out"
    except Exception as e: return f"error: {e}"

def _llm(prompt, system="", model=None):
    from litellm import completion
    msgs = []
    if system: msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    r = completion(model=f"openai/{model or FAST}", messages=msgs,
                   api_base=LLM_BASE, api_key="local", timeout=45)
    return (r.choices[0].message.content or "").strip()

# ── CAT 8: AI / VISION ────────────────────────────────────────────────────────

@tool
def color_palette(prompt: str) -> str:
    """Generate a 5-color accessible dark UI palette (hex codes) from a description."""
    try:
        return _llm(
            f"Generate a 5-color accessible dark UI palette for: {prompt}\\n"
            "Output ONLY 5 hex codes, one per line. Example:\\n#1a1a2e\\n#16213e\\n#0f3460\\n#533483\\n#e94560")
    except Exception as e: return f"palette error: {e}"

@tool
def vision_analyze(image_path: str, question: str = "Describe UI issues or improvements") -> str:
    """Analyze a screenshot with a vision LLM. image_path: local path or URL."""
    try:
        import base64
        from litellm import completion
        if os.path.exists(image_path):
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            img_url = f"data:image/png;base64,{b64}"
        else:
            img_url = image_path
        content = [{"type": "text", "text": question},
                   {"type": "image_url", "image_url": {"url": img_url}}]
        r = completion(model=f"openai/{VISION_MODEL}",
                       messages=[{"role": "user", "content": content}],
                       api_base=LLM_BASE, api_key="local", timeout=60)
        return (r.choices[0].message.content or "").strip()
    except Exception as e: return f"vision error: {e}"

@tool
def llm_code_review(file_path: str) -> str:
    """AI code review of a workspace file. Returns bugs, security issues, improvements."""
    full = file_path if os.path.isabs(file_path) else os.path.join(WORKSPACE, file_path)
    try:
        with open(full, encoding="utf-8") as f: code = f.read(8000)
    except Exception as e: return f"read error: {e}"
    try:
        return _llm(f"Review for bugs, security issues, improvements:\\n\\n```\\n{code}\\n```",
                    "You are a senior code reviewer. Be concise. List only real issues.")
    except Exception as e: return f"review error: {e}"

@tool
def llm_generate_copy(page_type: str, brand: str = "DaveAI", tone: str = "professional") -> str:
    """Generate marketing copy/text for a website page."""
    try:
        return _llm(f"Write compelling {tone} copy for a {page_type} page for \\"{brand}\\". "
                    "Include: headline, subheadline, 3 feature bullets, CTA. Modern and concise.")
    except Exception as e: return f"copy error: {e}"

@tool
def llm_seo_meta(page_title: str, page_description: str) -> str:
    """Generate HTML SEO meta tags for a page."""
    try:
        return _llm(f"Generate HTML SEO meta tags for:\\nTitle: {page_title}\\nDesc: {page_description}\\n"
                    "Include title, meta description, og:title, og:description, og:type, twitter:card. HTML only.")
    except Exception as e: return f"seo error: {e}"

@tool
def llm_summarize(text: str, max_words: int = 100) -> str:
    """Summarize long text to max_words words using the fast model."""
    if len(text) < 500: return text
    try: return _llm(f"Summarize in {max_words} words or fewer:\\n\\n{text[:6000]}")
    except Exception as e: return f"summarize error: {e}"

@tool
def llm_design_suggest(screenshot_path: str) -> str:
    """Analyze a screenshot and suggest 5 specific, actionable UI improvements."""
    return vision_analyze.invoke({
        "image_path": screenshot_path,
        "question": ("Analyze this website screenshot. Suggest 5 specific, actionable design improvements. "
                     "Focus on visual hierarchy, spacing, color contrast, typography, modern aesthetics. "
                     "Name exact CSS changes, component additions, layout fixes.")
    })

# ── CAT 9: COMPONENTS & FRAMEWORK ─────────────────────────────────────────────

@tool
def shadcn_add(component_name: str) -> str:
    """Add a shadcn/ui component to the Next.js project."""
    return _sh(f"npx shadcn@latest add {component_name} --yes 2>&1 | tail -10", WORKSPACE, 60)

@tool
def component_scaffold(name: str, props: str = "", description: str = "") -> str:
    """Scaffold a typed React/TypeScript component. props: comma-separated e.g. \'title:string, count:number\'"""
    pascal = name[0].upper() + name[1:] if name else "Component"
    prop_types = "\\n  ".join(f"{p.strip()};" for p in props.split(",") if p.strip()) if props else "className?: string"
    arg_names = ", ".join(p.strip().split(":")[0].strip() for p in props.split(",") if ":" in p) if props else "{ className }"
    content = f\'\'\'import React from "react"

interface {pascal}Props {{
  {prop_types}
}}

export function {pascal}({{{arg_names}}}: {pascal}Props) {{
  return (
    <div>
      {{/* {description or f"{pascal} component"} */}}
    </div>
  )
}}

export default {pascal}
\'\'\'
    dest = os.path.join(WORKSPACE, "components", f"{pascal}.tsx")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f: f.write(content)
    return f"Created: {dest}"

@tool
def page_scaffold(route: str, title: str = "") -> str:
    """Scaffold a Next.js App Router page. route: URL path e.g. \'about\' or \'blog/posts\'"""
    clean = route.strip("/").replace(" ", "-").lower()
    page_title = title or clean.replace("-", " ").title()
    component = page_title.replace(" ", "")
    page_dir = os.path.join(WORKSPACE, "app", clean)
    os.makedirs(page_dir, exist_ok=True)
    content = f\'\'\'\"use client\"

export default function {component}Page() {{
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <h1 className="text-3xl font-bold mb-4">{page_title}</h1>
      <p className="text-slate-400">Page content goes here.</p>
    </main>
  )
}}
\'\'\'
    page_file = os.path.join(page_dir, "page.tsx")
    with open(page_file, "w", encoding="utf-8") as f: f.write(content)
    return f"Created: {page_file}  (route: /{clean})"

@tool
def api_route_create(route: str, methods: str = "GET,POST") -> str:
    """Create a Next.js App Router API route handler."""
    clean = route.strip("/").replace(" ", "-").lower()
    api_dir = os.path.join(WORKSPACE, "app", "api", clean)
    os.makedirs(api_dir, exist_ok=True)
    handlers = []
    for m in [x.strip().upper() for x in methods.split(",")]:
        if m == "GET":
            handlers.append(\'export async function GET(request: Request) {\\n  return Response.json({ status: "ok" })\\n}\')
        elif m == "POST":
            handlers.append(\'export async function POST(request: Request) {\\n  const body = await request.json()\\n  return Response.json({ status: "ok", received: body })\\n}\')
    content = \'import { NextRequest } from "next/server"\\n\\n\' + "\\n\\n".join(handlers)
    rfile = os.path.join(api_dir, "route.ts")
    with open(rfile, "w", encoding="utf-8") as f: f.write(content)
    return f"Created API route: {rfile}"

# ── CAT 10: INFRASTRUCTURE ────────────────────────────────────────────────────

@tool
def env_read() -> str:
    """Read non-secret env vars from the brain .env file."""
    try:
        lines = []
        with open("/opt/agent-brain/.env") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"): continue
                key = line.split("=")[0]
                if any(s in key.upper() for s in ["PASS", "SECRET", "TOKEN", "KEY", "API"]):
                    lines.append(f"{key}=****")
                else:
                    lines.append(line)
        return "\\n".join(lines)
    except Exception as e: return f"error: {e}"

@tool
def ssl_check(domain: str = "daveai.tech") -> str:
    """Check SSL certificate validity and expiry date."""
    return _sh(f\'echo | openssl s_client -servername {domain} -connect {domain}:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "openssl unavailable"\', "/root")

@tool
def backup_create(label: str = "") -> str:
    """Create timestamped tar.gz backup of workspace + key configs."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = f"/opt/agent-brain/backups/backup{(\'-\'+label) if label else \'\'}-{ts}.tar.gz"
    _sh("mkdir -p /opt/agent-brain/backups", "/root")
    _sh(f\'tar -czf {dest} --exclude=./node_modules --exclude=./.next --exclude=./.git . 2>&1\', WORKSPACE, 60)
    size = _sh(f"du -sh {dest} 2>/dev/null | cut -f1", "/root")
    return f"Backup: {dest} ({size.strip()})"

@tool
def dependency_outdated() -> str:
    """List outdated npm packages."""
    return _sh("npm outdated 2>&1 | head -20", WORKSPACE, 30)

@tool
def accessibility_check(url: str = "http://127.0.0.1:3001") -> str:
    """Run axe-core accessibility audit via Playwright."""
    script = f\'\'\'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page()
    pg.goto("{url}", timeout=20000)
    pg.add_script_tag(url="https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js")
    res=pg.evaluate("() => new Promise(r => axe.run((e,r2) => r(r2)))")
    vs=res.get("violations",[])
    if vs:
        for v in vs[:6]: print(f"[{{v[\'impact\']}}] {{v[\'id\']}}: {{v[\'description\']}}")
    else: print("No violations found")
    br.close()
\'\'\'
    r = subprocess.run(["/opt/agent-brain/venv/bin/python3", "-c", script],
                       capture_output=True, text=True, timeout=45)
    return r.stdout.strip() or r.stderr.strip()

@tool
def broken_links_check(base_url: str = "http://127.0.0.1:3001") -> str:
    """Scan the live site for broken links."""
    script = f\'\'\'
from playwright.sync_api import sync_playwright
import urllib.request
with sync_playwright() as p:
    br=p.chromium.launch(); pg=br.new_page()
    pg.goto("{base_url}", timeout=20000)
    links=pg.eval_on_selector_all("a[href]","els => els.map(e => e.href)")
    broken=[]
    for link in list(set(links))[:25]:
        if not link.startswith("http"): continue
        try: urllib.request.urlopen(link, timeout=5)
        except: broken.append(f"BROKEN: {{link}}")
    br.close()
    print("\\\\n".join(broken) or "All links OK")
\'\'\'
    r = subprocess.run(["/opt/agent-brain/venv/bin/python3", "-c", script],
                       capture_output=True, text=True, timeout=60)
    return r.stdout.strip() or r.stderr.strip()

# ── CAT 11: COMMUNICATION ─────────────────────────────────────────────────────

@tool
def email_send(subject: str, body: str, to: str = "") -> str:
    """Send email notification via SMTP (needs SMTP_USER/SMTP_PASS in .env)."""
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    admin_email = os.getenv("ADMIN_EMAIL", "fnice1971@gmail.com")
    if not smtp_user or not smtp_pass:
        return "Email skipped: set SMTP_USER and SMTP_PASS in .env"
    try:
        msg = MIMEText(body)
        msg["Subject"] = f"[DaveAI] {subject}"
        msg["From"] = smtp_user
        msg["To"] = to or admin_email
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls(); s.login(smtp_user, smtp_pass); s.send_message(msg)
        return f"Email sent: {subject}"
    except Exception as e: return f"Email error: {e}"

@tool
def webhook_post(url: str, payload: str) -> str:
    """POST a JSON payload to a webhook URL."""
    try:
        data = payload.encode() if isinstance(payload, str) else json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data,
              headers={"Content-Type": "application/json", "User-Agent": "DaveAI/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return f"HTTP {r.status}: {r.read(500).decode(errors=\'replace\')}"
    except Exception as e: return f"webhook error: {e}"

@tool
def log_event_skill(event: str, detail: str = "") -> str:
    """Write an event to the DaveAI SQLite analytics log."""
    try:
        db = sqlite3.connect(DB_PATH)
        db.execute("CREATE TABLE IF NOT EXISTS analytics "
                   "(id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, detail TEXT, ts TEXT)")
        db.execute("INSERT INTO analytics (event,detail,ts) VALUES (?,?,?)",
                   (event, detail[:200], datetime.now().isoformat()))
        db.commit(); db.close()
        return f"logged: {event}"
    except Exception as e: return f"log error: {e}"
'''

with open("agent_skills_p2.py", "w", encoding="utf-8") as f:
    f.write(content)
print("agent_skills_p2.py written successfully")
