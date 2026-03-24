"""brain_deploy.py — Blue/green deployment agent for DaveAI pipeline.

Manages the full deploy lifecycle:
    staging deploy → health check → promote to production → rollback on failure

Architecture (blue/green):
    Production: /var/www/agentic-website  (port 3001)
    Staging:    /var/www/agentic-staging  (port 3002)

Deploy flow:
    1. Build + deploy to staging (3002)
    2. Health check staging (must return 200 in 60s)
    3. Swap: staging → production (PM2 reload)
    4. Verify production health
    5. On failure: rollback to last git tag

Triple failsafe:
    1. Full blue/green deploy (primary)
    2. PM2 reload only (no build, just restart)
    3. Git rollback to last good tag (emergency)

Usage:
    from brain_deploy import full_deploy, deploy_staging, rollback_to_last_good

    result = full_deploy()
    # Returns: {ok, stage, message, git_hash, rollback_available}
"""

import json
import os
import subprocess
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────
_WORKSPACE         = os.getenv("WORKSPACE",         "/var/www/agentic-website")
_STAGING_DIR       = os.getenv("WORKSPACE_STAGING", "/var/www/agentic-staging")
_PROD_URL          = os.getenv("PROD_URL",    "http://localhost:3001")
_STAGING_URL       = os.getenv("STAGING_URL", "http://localhost:3002")
_HEALTH_PATH       = "/health"
_HEALTH_TIMEOUT    = 60   # seconds to wait for health check
_BUILD_TIMEOUT     = 300  # 5 minutes max for npm build
_TELEGRAM_TOKEN    = os.getenv("TELEGRAM_TOKEN",   "")
_TELEGRAM_CHAT_ID  = os.getenv("TELEGRAM_CHAT_ID", "")


# ── Main entry point ──────────────────────────────────────────────────────────
def full_deploy(site_name: str = "main") -> dict:
    """
    Execute a full blue/green deployment.

    Returns:
        {
            "ok": bool,
            "stage": str,           # "staging" | "production" | "rollback"
            "message": str,
            "git_hash": str,
            "duration_s": float,
            "rollback_available": bool,
        }
    """
    start = time.monotonic()

    # ── Failsafe 1: Full blue/green ──────────────────────────────────────────
    try:
        result = _full_bluegreen_deploy(site_name)
        result["duration_s"] = round(time.monotonic() - start, 1)
        return result
    except Exception as e:
        print(f"[deploy] Blue/green failed: {e}")
        _notify(f"⚠️ Blue/green deploy failed: {e}. Trying PM2 reload...")

    # ── Failsafe 2: PM2 reload only ─────────────────────────────────────────
    try:
        result = _pm2_reload_only()
        result["duration_s"] = round(time.monotonic() - start, 1)
        _notify(f"✅ Deploy complete via PM2 reload (git: {result.get('git_hash','')})")
        return result
    except Exception as e:
        print(f"[deploy] PM2 reload failed: {e}")
        _notify(f"🚨 PM2 reload also failed: {e}. Initiating rollback...")

    # ── Failsafe 3: Git rollback ─────────────────────────────────────────────
    result = rollback_to_last_good()
    result["duration_s"] = round(time.monotonic() - start, 1)
    return result


# ── Failsafe 1: Full blue/green deploy ───────────────────────────────────────
def _full_bluegreen_deploy(site_name: str) -> dict:
    """Full blue/green: build staging → health check → swap to production."""
    git_hash = _get_git_hash(_WORKSPACE)

    # Tag current production before overwriting
    _sh(f"git tag -f pre-deploy-{int(time.time())} HEAD", cwd=_WORKSPACE)

    # 1. Deploy to staging
    staging_result = deploy_staging()
    if not staging_result["ok"]:
        raise RuntimeError(f"Staging deploy failed: {staging_result['message']}")

    # 2. Health check staging
    hc = health_check(_STAGING_URL, timeout=_HEALTH_TIMEOUT)
    if not hc["ok"]:
        raise RuntimeError(f"Staging health check failed: {hc['message']}")

    # 3. Promote staging → production
    prod_result = promote_to_production()
    if not prod_result["ok"]:
        raise RuntimeError(f"Production promotion failed: {prod_result['message']}")

    # 4. Verify production
    hc_prod = health_check(_PROD_URL, timeout=30)
    if not hc_prod["ok"]:
        # Auto-rollback
        rollback_to_last_good()
        raise RuntimeError(f"Production health check failed after promotion: {hc_prod['message']}")

    _notify(f"✅ Full blue/green deploy complete! git={git_hash}")
    return {
        "ok": True,
        "stage": "production",
        "message": "Blue/green deploy successful",
        "git_hash": git_hash,
        "rollback_available": True,
    }


# ── Staging deploy ────────────────────────────────────────────────────────────
def deploy_staging() -> dict:
    """Build and deploy to staging environment (port 3002)."""
    try:
        # Sync workspace to staging
        rsync = _sh(
            f"rsync -av --delete --exclude='.git' --exclude='node_modules' "
            f"--exclude='.next' {_WORKSPACE}/ {_STAGING_DIR}/",
        )

        # Install deps in staging
        _sh("npm ci --prefer-offline", cwd=_STAGING_DIR, timeout=120)

        # Build staging
        build_out = _sh("npm run build", cwd=_STAGING_DIR, timeout=_BUILD_TIMEOUT)
        if "error" in build_out.lower() and "✓" not in build_out:
            raise RuntimeError(f"Build failed:\n{build_out[:500]}")

        # PM2 reload staging-ui
        _sh("pm2 reload staging-ui --update-env 2>/dev/null || pm2 start ecosystem.config.js --only staging-ui")

        return {"ok": True, "message": "Staging deploy complete", "build_output": build_out[:200]}

    except Exception as e:
        return {"ok": False, "message": str(e)}


# ── Health check ──────────────────────────────────────────────────────────────
def health_check(url: str, timeout: int = 60) -> dict:
    """
    Poll the health endpoint until it returns 200 or timeout.

    Returns:
        {"ok": bool, "message": str, "attempts": int, "latency_ms": int}
    """
    target = url.rstrip("/") + _HEALTH_PATH
    attempts = 0
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        attempts += 1
        t0 = time.monotonic()
        try:
            req = urllib.request.Request(target)
            with urllib.request.urlopen(req, timeout=5) as resp:
                latency_ms = round((time.monotonic() - t0) * 1000)
                if resp.status == 200:
                    return {
                        "ok": True,
                        "message": f"Health check passed ({latency_ms}ms)",
                        "attempts": attempts,
                        "latency_ms": latency_ms,
                    }
        except Exception:
            pass
        time.sleep(3)

    return {
        "ok": False,
        "message": f"Health check failed after {timeout}s ({attempts} attempts)",
        "attempts": attempts,
        "latency_ms": 0,
    }


# ── Promote staging → production ─────────────────────────────────────────────
def promote_to_production() -> dict:
    """
    Promote staging build to production:
    - Copy .next build from staging to production
    - PM2 reload agentic-ui
    """
    try:
        # Copy the built .next directory
        _sh(
            f"rsync -av --delete {_STAGING_DIR}/.next/ {_WORKSPACE}/.next/ "
            f"&& rsync -av --delete {_STAGING_DIR}/public/ {_WORKSPACE}/public/ "
            f"&& rsync -av {_STAGING_DIR}/package*.json {_WORKSPACE}/",
        )

        # Reload production PM2 process
        reload_out = _sh("pm2 reload agentic-ui --update-env")

        git_hash = _get_git_hash(_WORKSPACE)
        _sh(f"git tag -f last-good-deploy HEAD", cwd=_WORKSPACE)

        return {
            "ok": True,
            "message": f"Production promotion complete (git={git_hash})",
            "git_hash": git_hash,
        }
    except Exception as e:
        return {"ok": False, "message": str(e)}


# ── Rollback ──────────────────────────────────────────────────────────────────
def rollback_to_last_good() -> dict:
    """
    Emergency rollback to last known good state.

    Tries:
        1. Git reset to last-good-deploy tag
        2. PM2 restart from existing build
        3. Telegram alert (always)
    """
    msg = "🔄 Initiating emergency rollback..."
    _notify(msg)
    print(f"[deploy] {msg}")

    try:
        # Try git tag rollback
        tag_out = _sh("git describe --tags --match 'last-good-deploy' 2>/dev/null || echo 'no-tag'", cwd=_WORKSPACE)
        if "no-tag" not in tag_out:
            _sh("git checkout last-good-deploy -- .next public", cwd=_WORKSPACE)
        else:
            # Just restart PM2 with whatever is there
            _sh("pm2 restart agentic-ui 2>/dev/null || true")

        # Always try PM2 restart
        _sh("pm2 restart agentic-ui 2>/dev/null || pm2 reload agentic-ui 2>/dev/null || true")

        git_hash = _get_git_hash(_WORKSPACE)
        _notify(f"🔄 Rollback complete. Running git={git_hash}")

        return {
            "ok": True,
            "stage": "rollback",
            "message": f"Rollback complete (git={git_hash})",
            "git_hash": git_hash,
            "rollback_available": False,
        }

    except Exception as e:
        _notify(f"🚨 CRITICAL: Rollback failed! {e} — MANUAL INTERVENTION REQUIRED")
        return {
            "ok": False,
            "stage": "rollback",
            "message": f"Rollback failed: {e} — manual intervention required",
            "git_hash": "",
            "rollback_available": False,
        }


# ── Failsafe 2: PM2 reload only ──────────────────────────────────────────────
def _pm2_reload_only() -> dict:
    """Simple PM2 reload without building."""
    reload_out = _sh("pm2 reload agentic-ui --update-env 2>&1")
    git_hash = _get_git_hash(_WORKSPACE)

    if "error" in reload_out.lower():
        raise RuntimeError(reload_out[:200])

    return {
        "ok": True,
        "stage": "production",
        "message": f"PM2 reload complete (no build)",
        "git_hash": git_hash,
        "rollback_available": True,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────
def _sh(cmd: str, cwd: str = None, timeout: int = 120) -> str:
    """Run shell command, return stdout+stderr truncated to 3000 chars."""
    try:
        r = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=cwd or _WORKSPACE,
        )
        out = (r.stdout.strip() or r.stderr.strip() or "done")
        return out[:3000]
    except subprocess.TimeoutExpired:
        return f"error: command timed out after {timeout}s"
    except Exception as e:
        return f"error: {e}"


def _get_git_hash(cwd: str) -> str:
    """Get current git HEAD short hash."""
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5, cwd=cwd,
        )
        return r.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def _notify(message: str):
    """Send Telegram notification. Silent on failure."""
    if not _TELEGRAM_TOKEN or not _TELEGRAM_CHAT_ID:
        return
    try:
        payload = json.dumps({
            "chat_id": _TELEGRAM_CHAT_ID,
            "text": f"[DaveAI Deploy] {message}",
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{_TELEGRAM_TOKEN}/sendMessage",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass
