"""brain_core.py — config, constants, shared state. Base layer; zero internal imports."""
import os
from dotenv import load_dotenv

load_dotenv()

# ── LLM / services ────────────────────────────────────────────────────────────
WORKSPACE     = os.getenv("WORKSPACE",     "/var/www/agentic-website")
LLM_BASE      = os.getenv("LITELLM_URL",   "http://127.0.0.1:4000")
HEAVY         = os.getenv("HEAVY_MODEL",   "heavy-coder")
FAST          = os.getenv("FAST_MODEL",    "fast-agent")
VISION        = os.getenv("VISION_MODEL",  "vision")
AUTO          = os.getenv("AUTONOMY",      "supervised")
ZC_URL        = os.getenv("ZEROCLAW_URL",  "http://127.0.0.1:3000")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# ── Multi-pipeline endpoints ──────────────────────────────────────────────────
COMFYUI_URL    = os.getenv("COMFYUI_URL",     "http://localhost:8188")
TTS_URL        = os.getenv("TTS_URL",         "http://localhost:5050")
EMBED_URL      = os.getenv("EMBED_URL",       "http://localhost:1234")
# TTS backends (see MODEL_DB_PART6_VOICE_TOOLS.md for full inventory)
ALLTALK_URL    = os.getenv("ALLTALK_URL",     "http://localhost:7851")
CHATTERBOX_URL = os.getenv("CHATTERBOX_URL",  "http://localhost:8003")
FISHSPEECH_URL = os.getenv("FISHSPEECH_URL",  "http://localhost:8080")
GPTSOVITS_URL  = os.getenv("GPTSOVITS_URL",   "http://localhost:9880")
KOBOLDCPP_URL  = os.getenv("KOBOLDCPP_URL",   "http://localhost:5001")

# ── External services ──────────────────────────────────────────────────────────
GITLAB_URL  = os.getenv("GITLAB_URL",   "http://localhost:8929")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL",  "fnice1971@gmail.com")
SMTP_HOST   = os.getenv("SMTP_HOST",    "smtp.gmail.com")
SMTP_PORT   = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER   = os.getenv("SMTP_USER",    "")
SMTP_PASS   = os.getenv("SMTP_PASS",    "")

# ── Security ───────────────────────────────────────────────────────────────────
JWT_SECRET  = os.getenv("JWT_SECRET", "daveai-jwt-secret-change-me")
_JWT_WEAK_VALUES = {
    "daveai-jwt-secret-change-me",
    "daveai-jwt-change-me-in-prod",
}
if len(JWT_SECRET) < 32 or JWT_SECRET in _JWT_WEAK_VALUES:
    import warnings
    warnings.warn(
        "SECURITY: JWT_SECRET is weak or uses a known placeholder. "
        "Set a strong random JWT_SECRET env var in ecosystem.config.js immediately.",
        RuntimeWarning,
        stacklevel=2,
    )

# ── Filesystem paths ───────────────────────────────────────────────────────────
DB_PATH    = "/opt/agent-brain/daveai.db"
VAULT_PATH = "/opt/agent-brain/keyvault.json"
SHOTS_DIR  = "/opt/agent-brain/screenshots"
LOG_DIR    = "/opt/agent-brain/logs"
PUBLIC_DIR = os.getenv("PUBLIC_DIR", "/var/www/agentic-website/public")

# ── Agent roles ────────────────────────────────────────────────────────────────
AGENT_ROLES = ["supervisor", "coder", "asset", "qa"]

# ── Shared mutable state (mutated by brain_events) ────────────────────────────
_agent_status: dict = {
    role: {"status": "idle", "task": "", "progress": 0, "model": "", "ts": ""}
    for role in AGENT_ROLES
}
_pqueues: dict   = {}   # req_id → queue.Queue for SSE
_event_bus: list = []   # rolling event buffer for /events monitor

# ── Runtime model overrides ────────────────────────────────────────────────────
# Maps role → model string override set via POST /agents/{role}/model.
# brain_graph reads this when constructing new LLM instances.
_agent_models: dict = {}  # e.g. {"coder": "openrouter/openai/gpt-4o-mini"}

# ── Routing ────────────────────────────────────────────────────────────────────
WEBSITE_KEYWORDS = [
    "add","create","build","make","design","update","change","modify","remove",
    "delete","fix","refactor","style","color","font","layout","page","section",
    "navbar","footer","hero","button","form","grid","animation","dark mode",
    "responsive","component","feature","deploy","rebuild","rewrite","implement",
    "install","configure","css","html","javascript","typescript","next","react",
    "tailwind","image","icon","logo","background","gradient","card","modal",
    "widget","gallery","carousel","table","chart","scroll","hover",
]
DESTRUCTIVE_PHRASES = [
    "rebuild all","delete everything","wipe site","start from scratch",
    "drop all","reset everything",
]

def is_website_change(msg: str) -> bool:
    low = msg.lower()
    return any(k in low for k in WEBSITE_KEYWORDS) and len(msg) > 8

def is_destructive(msg: str) -> bool:
    low = msg.lower()
    return AUTO == "supervised" and any(p in low for p in DESTRUCTIVE_PHRASES)

