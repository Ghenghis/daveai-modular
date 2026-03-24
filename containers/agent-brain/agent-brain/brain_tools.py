"""brain_tools.py — core tools: shell/file/git/gitlab/huggingface/npm + git helpers."""
import os, subprocess, json
from datetime import datetime
from langchain_core.tools import tool
from brain_core import WORKSPACE, GITLAB_URL
from brain_events import agent_set
from brain_auth import vault_read
from brain_skills import TOOLS_BY_NAME, ALL_SKILLS, run_tool

# ── Workspace boundary enforcement ───────────────────────────────────────────
def _safe_path(path: str) -> str:
    """Resolve path and enforce it stays inside WORKSPACE. Raises ValueError on escape."""
    if os.path.isabs(path):
        full = os.path.realpath(path)
    else:
        full = os.path.realpath(os.path.join(WORKSPACE, path))
    ws_real = os.path.realpath(WORKSPACE)
    if not full.startswith(ws_real + os.sep) and full != ws_real:
        raise ValueError(f"Path escapes workspace: {path} → {full}")
    return full

# ── Legacy core tools (always available) ──────────────────────────────────────
# Dangerous shell metacharacters that could enable command injection
_SHELL_BLOCKLIST = [";", "&&", "||", "`", "$(", ">", ">>", "<", "|", "\n", "\r"]

@tool
def shell_run(command: str) -> str:
    """Execute a shell command in the website workspace. Blocked: pipes, redirects, chaining."""
    # Guard: reject commands with shell metacharacters that enable injection
    for ch in _SHELL_BLOCKLIST:
        if ch in command:
            return f"error: blocked shell metacharacter '{ch}' — use separate tool calls instead"
    try:
        r = subprocess.run(command, shell=True, capture_output=True,
                           text=True, timeout=120, cwd=WORKSPACE)
        return r.stdout.strip() or r.stderr.strip() or "done"
    except subprocess.TimeoutExpired:
        return "error: timed out"
    except Exception as e:
        return f"error: {e}"

@tool
def file_write(path: str, content: str) -> str:
    """Write content to a file in the workspace. Path must be inside workspace."""
    try:
        full = _safe_path(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        return f"written: {full}"
    except ValueError as ve:
        return f"error: {ve}"
    except Exception as e:
        return f"error: {e}"

@tool
def file_read(path: str) -> str:
    """Read file contents from the workspace. Path must be inside workspace."""
    try:
        full = _safe_path(path)
        with open(full, encoding="utf-8") as f:
            return f.read()
    except ValueError as ve:
        return f"error: {ve}"
    except Exception as e:
        return f"error: {e}"

@tool
def git_status_tool() -> str:
    """Show git status and last 5 commits of the workspace."""
    r = subprocess.run(
        "git status --short && echo '---' && git log --oneline -5",
        shell=True, capture_output=True, text=True, cwd=WORKSPACE)
    return r.stdout.strip()

@tool
def gitlab_clone(project_path: str, target_subdir: str = "") -> str:
    """Clone a project from the self-hosted GitLab instance into the workspace."""
    agent_set("asset", "running", f"Cloning {project_path[:50]}", 20, "")
    vault = vault_read()
    base_url = vault.get("gitlab_url", GITLAB_URL).rstrip("/")
    token = vault.get("gitlab_token", "")
    if token:
        parsed = base_url.replace("http://", "").replace("https://", "")
        scheme = "https" if base_url.startswith("https") else "http"
        clone_url = f"{scheme}://oauth2:{token}@{parsed}/{project_path}.git"
    else:
        clone_url = f"{base_url}/{project_path}.git"
    dest = os.path.join(WORKSPACE, target_subdir or project_path.split("/")[-1])
    r = subprocess.run(f"git clone {clone_url} {dest} 2>&1",
                       shell=True, capture_output=True, text=True, timeout=180)
    agent_set("asset", "idle", f"Cloned {project_path[:40]}", 100, "")
    return r.stdout.strip() or r.stderr.strip() or f"Cloned to {dest}"

@tool
def gitlab_list_projects() -> str:
    """List accessible projects on the local GitLab instance."""
    import urllib.request
    vault = vault_read()
    base_url = vault.get("gitlab_url", GITLAB_URL).rstrip("/")
    token = vault.get("gitlab_token", "")
    if not token:
        return "No gitlab_token in vault. Add via POST /vault."
    req = urllib.request.Request(
        f"{base_url}/api/v4/projects?membership=true&per_page=20",
        headers={"PRIVATE-TOKEN": token})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            projects = json.loads(resp.read())
        return "\n".join(
            f"{p['path_with_namespace']} — {p.get('description','')[:60]}"
            for p in projects)
    except Exception as e:
        return f"GitLab API error: {e}"

@tool
def huggingface_download(model_id: str, local_dir: str = "") -> str:
    """Download a model or dataset from HuggingFace Hub."""
    agent_set("asset", "running", f"HF download: {model_id[:50]}", 30, "")
    vault = vault_read()
    token = vault.get("huggingface_token", "")
    dest = local_dir or f"/opt/models/{model_id.replace('/', '--')}"
    env = f"HF_TOKEN={token} " if token else ""
    r = subprocess.run(
        f'{env}python3 -c "from huggingface_hub import snapshot_download; '
        f'snapshot_download(\'{model_id}\',local_dir=\'{dest}\')" 2>&1',
        shell=True, capture_output=True, text=True, timeout=300)
    agent_set("asset", "idle", f"Downloaded {model_id}", 100, "")
    return r.stdout.strip() or r.stderr.strip() or f"Downloaded to {dest}"

@tool
def npm_install(package: str) -> str:
    """Install an npm package in the website workspace."""
    r = subprocess.run(f"npm install {package} 2>&1", shell=True,
                       capture_output=True, text=True, timeout=120, cwd=WORKSPACE)
    return r.stdout[-500:] or r.stderr[-500:] or "installed"

# ── P0 Missing Skills ─────────────────────────────────────────────────────────
@tool
def directory_list(subpath: str = ".") -> str:
    """List files/dirs in the workspace recursively (max 3 levels deep)."""
    try:
        target = _safe_path(subpath)
        r = subprocess.run(f"find {target} -maxdepth 3 -not -path '*/node_modules/*' "
                           f"-not -path '*/.git/*' -not -path '*/.next/*' | sort",
                           shell=True, capture_output=True, text=True, timeout=15)
        return r.stdout.strip()[:3000] or "empty directory"
    except Exception as e:
        return f"error: {e}"

@tool
def file_delete(path: str) -> str:
    """Delete a file from the workspace."""
    try:
        full = path if os.path.isabs(path) else os.path.join(WORKSPACE, path)
        if not full.startswith(WORKSPACE):
            return "error: path outside workspace"
        os.remove(full)
        return f"deleted: {full}"
    except Exception as e:
        return f"error: {e}"

@tool
def file_move(src: str, dst: str) -> str:
    """Move or rename a file within the workspace."""
    import shutil
    try:
        s = src if os.path.isabs(src) else os.path.join(WORKSPACE, src)
        d = dst if os.path.isabs(dst) else os.path.join(WORKSPACE, dst)
        if not s.startswith(WORKSPACE) or not d.startswith(WORKSPACE):
            return "error: path outside workspace"
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.move(s, d)
        return f"moved: {s} → {d}"
    except Exception as e:
        return f"error: {e}"

@tool
def grep_workspace(pattern: str, file_glob: str = "*") -> str:
    """Search for text pattern in workspace files. file_glob e.g. '*.tsx'."""
    try:
        r = subprocess.run(
            f"grep -r --include='{file_glob}' -n --color=never "
            f"'{pattern}' {WORKSPACE} 2>&1 | head -50",
            shell=True, capture_output=True, text=True, timeout=15)
        return r.stdout.strip() or "no matches"
    except Exception as e:
        return f"error: {e}"

@tool
def git_diff(staged: bool = False) -> str:
    """Show git diff of workspace changes. staged=True shows staged changes."""
    flag = "--cached" if staged else ""
    r = subprocess.run(f"git diff {flag} --stat && git diff {flag} | head -200",
                       shell=True, capture_output=True, text=True, cwd=WORKSPACE)
    return r.stdout.strip() or "no changes"

@tool
def git_push(remote: str = "origin", branch: str = "main") -> str:
    """Push committed changes to the git remote (GitLab backup)."""
    r = subprocess.run(f"git push {remote} {branch} 2>&1",
                       shell=True, capture_output=True, text=True,
                       timeout=60, cwd=WORKSPACE)
    return r.stdout.strip() or r.stderr.strip() or "pushed"

@tool
def npm_run(script: str) -> str:
    """Run an npm script (e.g. 'build', 'dev', 'lint', 'test') in the workspace."""
    r = subprocess.run(f"npm run {script} 2>&1 | tail -30", shell=True,
                       capture_output=True, text=True, timeout=180, cwd=WORKSPACE)
    return r.stdout.strip()[-2000:] or "done"

@tool
def npm_build() -> str:
    """Run npm run build in the website workspace and return last 50 lines of output."""
    r = subprocess.run("npm run build 2>&1 | tail -50", shell=True,
                       capture_output=True, text=True, timeout=300, cwd=WORKSPACE)
    out = r.stdout.strip()
    return out[-2000:] if out else "build complete (no output)"

@tool
def pm2_status() -> str:
    """Get status of all PM2 managed processes."""
    r = subprocess.run("pm2 jlist 2>/dev/null", shell=True,
                       capture_output=True, text=True, timeout=10)
    try:
        procs = json.loads(r.stdout)
        return "\n".join(
            f"{p['name']}: {p['pm2_env']['status']} | pid={p['pid']} | "
            f"restarts={p['pm2_env'].get('restart_time',0)}"
            for p in procs)
    except Exception:
        return r.stdout.strip() or "pm2 not available"

@tool
def pm2_restart(name: str) -> str:
    """Restart a PM2 process by name (e.g. 'agent-brain', 'agentic-ui')."""
    r = subprocess.run(f"pm2 restart {name} 2>&1", shell=True,
                       capture_output=True, text=True, timeout=30)
    return r.stdout.strip() or r.stderr.strip() or f"restarted {name}"

@tool
def service_health(url: str) -> str:
    """HTTP health check for any URL. Returns status code + first 200 chars of body."""
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DaveAI-Health/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read(200).decode(errors="replace")
            return f"HTTP {resp.status} — {body[:200]}"
    except Exception as e:
        return f"FAIL: {e}"

@tool
def playwright_screenshot(url: str = "", output_path: str = "/tmp/screenshot.png") -> str:
    """Take a screenshot of the live site (or any URL) using Playwright."""
    target = url or "https://daveai.tech"
    r = subprocess.run(
        f"npx playwright screenshot --browser chromium '{target}' '{output_path}' 2>&1",
        shell=True, capture_output=True, text=True, timeout=30, cwd=WORKSPACE)
    if os.path.exists(output_path):
        size = os.path.getsize(output_path)
        return f"screenshot saved: {output_path} ({size} bytes)"
    return r.stdout.strip() or r.stderr.strip() or "screenshot failed"

# ── Unified TOOLS list ─────────────────────────────────────────────────────────
_LEGACY = [
    shell_run, file_write, file_read, git_status_tool,
    gitlab_clone, gitlab_list_projects, huggingface_download, npm_install,
    directory_list, file_delete, file_move, grep_workspace,
    git_diff, git_push, npm_run, npm_build,
    pm2_status, pm2_restart, service_health, playwright_screenshot,
]
_skill_names = {t.name for t in ALL_SKILLS}
TOOLS = ALL_SKILLS + [t for t in _LEGACY if t.name not in _skill_names]
print(f"[brain_tools] TOOLS: {len(TOOLS)} ({len(ALL_SKILLS)} skills + {len(TOOLS)-len(ALL_SKILLS)} legacy)")

# ── Git helpers ────────────────────────────────────────────────────────────────
def git_commit(msg: str):
    safe = msg.replace('"', "'")[:72]
    subprocess.run(
        f'git add -A && git commit -m "{safe}" 2>&1 || true',
        shell=True, cwd=WORKSPACE, capture_output=True)

def git_rollback(ref: str):
    subprocess.run(f"git checkout {ref} -- .", shell=True, cwd=WORKSPACE)
    git_commit(f"rollback: restore to {ref}")

def git_log(n: int = 15) -> str:
    r = subprocess.run(f"git log --oneline -{n}", shell=True,
                       capture_output=True, text=True, cwd=WORKSPACE)
    return r.stdout.strip() or "no commits yet"
