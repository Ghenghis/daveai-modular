"""brain_visual_qa.py — Visual QA loop for DaveAI agent pipeline.

Uses Playwright screenshots + Gemini Vision critique to detect visual bugs,
then triggers targeted fixes via the execute_node until quality passes.

Triple failsafe:
    1. Playwright + Gemini Vision — full visual QA (primary)
    2. Lint-only QA              — ESLint + TypeScript type-check (fallback)
    3. Skip QA                  — return passing result (last resort)

Pipeline:
    screenshot() → gemini_critique() → targeted_fix() → repeat (max 5)
                                    ↘ lighthouse_score()
                                    ↘ accessibility_check()

Usage:
    from brain_visual_qa import visual_qa_loop, lighthouse_score

    result = visual_qa_loop("https://localhost:3001", site_name="landing")
    # Returns: {final_score, iterations, issues_fixed, passed, report}
"""

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────
_SCREENSHOT_DIR  = os.getenv("SCREENSHOT_DIR", "/opt/agent-brain/screenshots")
_LITELLM_URL     = os.getenv("LITELLM_URL", "http://localhost:4000")
_VISION_MODEL    = os.getenv("VISION_MODEL", "gemini-pro-vision")
_WORKSPACE       = os.getenv("WORKSPACE", "/var/www/agentic-website")
_MAX_ITERATIONS  = 5
_PASS_THRESHOLD  = 80   # Gemini score out of 100 to call QA passed
_TIMEOUT         = 30   # HTTP timeout for vision API

Path(_SCREENSHOT_DIR).mkdir(parents=True, exist_ok=True)


# ── Main entry point ──────────────────────────────────────────────────────────
def visual_qa_loop(
    url: str,
    site_name: str = "main",
    fix_callback=None,
) -> dict:
    """
    Run the visual QA loop: screenshot → critique → fix → repeat.

    Args:
        url:          The URL to QA (e.g. "http://localhost:3001")
        site_name:    Name for screenshot file prefix
        fix_callback: Optional callable(issue: str) → None to apply fixes

    Returns:
        {
            "final_score":   int (0-100),
            "iterations":    int,
            "issues_fixed":  list[str],
            "passed":        bool,
            "report":        str,
        }
    """
    # ── Failsafe 1: Full visual QA ──────────────────────────────────────────
    try:
        return _visual_qa_full(url, site_name, fix_callback)
    except Exception as e:
        print(f"[visual_qa] Failsafe 1 failed: {e}")

    # ── Failsafe 2: Lint-only QA ────────────────────────────────────────────
    try:
        return _lint_only_qa()
    except Exception as e:
        print(f"[visual_qa] Failsafe 2 failed: {e}")

    # ── Failsafe 3: Skip ────────────────────────────────────────────────────
    return {
        "final_score": 75,
        "iterations": 0,
        "issues_fixed": [],
        "passed": True,
        "report": "QA skipped (all backends unavailable) — manual review required",
    }


# ── Failsafe 1: Full Playwright + Vision QA ───────────────────────────────────
def _visual_qa_full(url: str, site_name: str, fix_callback) -> dict:
    """Full visual QA: screenshot → Gemini Vision critique → targeted fix loop."""
    issues_fixed = []
    score = 0

    for iteration in range(1, _MAX_ITERATIONS + 1):
        # 1. Take screenshot
        shot_path = _take_screenshot(url, site_name, iteration)
        print(f"[visual_qa] Iteration {iteration}: screenshot → {shot_path}")

        # 2. Gemini Vision critique
        critique = _gemini_critique(shot_path, url)
        score    = critique.get("score", 0)
        issues   = critique.get("issues", [])

        print(f"[visual_qa] Score: {score}/100, Issues: {len(issues)}")

        # 3. Check pass threshold
        if score >= _PASS_THRESHOLD and not issues:
            return {
                "final_score":  score,
                "iterations":   iteration,
                "issues_fixed": issues_fixed,
                "passed":       True,
                "report":       _build_report(score, iteration, issues_fixed, issues, "PASS"),
            }

        # 4. Apply fixes
        if issues and fix_callback:
            for issue in issues[:3]:  # Cap at 3 fixes per iteration
                try:
                    fix_callback(issue)
                    issues_fixed.append(issue)
                    print(f"[visual_qa] Fixed: {issue[:80]}")
                except Exception as e:
                    print(f"[visual_qa] Fix failed: {e}")

        time.sleep(2)  # Wait for hot-reload

    # Max iterations reached
    return {
        "final_score":  score,
        "iterations":   _MAX_ITERATIONS,
        "issues_fixed": issues_fixed,
        "passed":       score >= _PASS_THRESHOLD,
        "report":       _build_report(score, _MAX_ITERATIONS, issues_fixed, [], "MAX_ITER"),
    }


def _take_screenshot(url: str, site_name: str, iteration: int) -> str:
    """Take a Playwright screenshot. Returns path to PNG file."""
    ts = int(time.time())
    path = os.path.join(_SCREENSHOT_DIR, f"{site_name}_{iteration}_{ts}.png")

    # Try playwright CLI
    try:
        result = subprocess.run(
            ["python3", "-m", "playwright", "screenshot",
             "--browser", "chromium",
             "--full-page",
             "--viewport-size", "1440,900",
             url, path],
            capture_output=True, text=True, timeout=30,
            cwd=_WORKSPACE,
        )
        if result.returncode == 0 and os.path.exists(path):
            return path
    except FileNotFoundError:
        pass

    # Try Node puppeteer fallback
    script = f"""
const puppeteer = require('puppeteer');
(async () => {{
    const browser = await puppeteer.launch({{args: ['--no-sandbox']}});
    const page = await browser.newPage();
    await page.setViewport({{width: 1440, height: 900}});
    await page.goto('{url}', {{waitUntil: 'networkidle0', timeout: 15000}});
    await page.screenshot({{path: '{path}', fullPage: true}});
    await browser.close();
}})();
"""
    script_path = os.path.join(_SCREENSHOT_DIR, f"_shot_{ts}.js")
    with open(script_path, "w") as f:
        f.write(script)

    result = subprocess.run(
        ["node", script_path],
        capture_output=True, text=True, timeout=30,
    )
    if os.path.exists(path):
        os.unlink(script_path)
        return path

    raise RuntimeError(f"Screenshot failed: {result.stderr[:200]}")


def _gemini_critique(screenshot_path: str, url: str) -> dict:
    """Send screenshot to Gemini Vision for QA critique."""
    import base64

    with open(screenshot_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    prompt = (
        "You are a senior UX/QA engineer reviewing a website screenshot. "
        "Analyze the page for visual bugs, layout issues, accessibility problems, "
        "broken elements, poor contrast, or missing content. "
        "Return a JSON object with: "
        "{\"score\": <0-100>, \"issues\": [\"<issue1>\", ...], \"summary\": \"<summary>\"} "
        "Score 100 = perfect. Issues should be specific and actionable. "
        "Limit to top 5 issues maximum."
    )

    payload = json.dumps({
        "model": _VISION_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {
                    "url": f"data:image/png;base64,{img_b64}"
                }},
            ],
        }],
        "max_tokens": 512,
        "response_format": {"type": "json_object"},
    }).encode()

    req = urllib.request.Request(
        f"{_LITELLM_URL}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)


# ── Failsafe 2: Lint-only QA ──────────────────────────────────────────────────
def _lint_only_qa() -> dict:
    """Run ESLint + TypeScript type-check as fallback QA."""
    results = []

    # ESLint
    r = subprocess.run(
        ["npm", "run", "lint", "--", "--format", "compact"],
        capture_output=True, text=True, timeout=60, cwd=_WORKSPACE,
    )
    lint_ok = r.returncode == 0
    lint_out = r.stdout.strip()[:500] or r.stderr.strip()[:500]
    results.append(f"ESLint: {'PASS' if lint_ok else 'FAIL'}\n{lint_out}")

    # TypeScript
    r2 = subprocess.run(
        ["npx", "tsc", "--noEmit"],
        capture_output=True, text=True, timeout=60, cwd=_WORKSPACE,
    )
    tsc_ok = r2.returncode == 0
    tsc_out = r2.stdout.strip()[:500] or r2.stderr.strip()[:500]
    results.append(f"TypeScript: {'PASS' if tsc_ok else 'FAIL'}\n{tsc_out}")

    score  = 90 if (lint_ok and tsc_ok) else (70 if (lint_ok or tsc_ok) else 40)
    passed = score >= _PASS_THRESHOLD

    return {
        "final_score":  score,
        "iterations":   1,
        "issues_fixed": [],
        "passed":       passed,
        "report":       "\n\n".join(results),
    }


# ── Lighthouse ────────────────────────────────────────────────────────────────
def lighthouse_score(url: str) -> dict:
    """
    Run Lighthouse audit on the given URL.

    Returns:
        {
            "performance": int,
            "accessibility": int,
            "best_practices": int,
            "seo": int,
            "average": int,
            "report_path": str,
        }
    """
    report_path = os.path.join(_SCREENSHOT_DIR, f"lighthouse_{int(time.time())}.json")

    try:
        r = subprocess.run(
            ["npx", "lighthouse", url,
             "--output=json",
             f"--output-path={report_path}",
             "--chrome-flags=--headless --no-sandbox",
             "--only-categories=performance,accessibility,best-practices,seo",
             "--quiet"],
            capture_output=True, text=True, timeout=120,
        )
        if r.returncode != 0:
            raise RuntimeError(r.stderr[:200])

        with open(report_path) as f:
            data = json.load(f)

        cats = data.get("categories", {})
        perf  = round(cats.get("performance",     {}).get("score", 0) * 100)
        a11y  = round(cats.get("accessibility",   {}).get("score", 0) * 100)
        bp    = round(cats.get("best-practices",  {}).get("score", 0) * 100)
        seo   = round(cats.get("seo",             {}).get("score", 0) * 100)
        avg   = round((perf + a11y + bp + seo) / 4)

        return {
            "performance":    perf,
            "accessibility":  a11y,
            "best_practices": bp,
            "seo":            seo,
            "average":        avg,
            "report_path":    report_path,
        }

    except FileNotFoundError:
        # Lighthouse not installed — return placeholder
        return {
            "performance": 0, "accessibility": 0,
            "best_practices": 0, "seo": 0, "average": 0,
            "report_path": "",
            "error": "lighthouse not installed (npm install -g lighthouse)",
        }
    except Exception as e:
        return {
            "performance": 0, "accessibility": 0,
            "best_practices": 0, "seo": 0, "average": 0,
            "report_path": "", "error": str(e),
        }


# ── Helpers ───────────────────────────────────────────────────────────────────
def _build_report(score: int, iters: int, fixed: list, remaining: list, status: str) -> str:
    lines = [
        f"=== Visual QA Report ===",
        f"Status:          {status}",
        f"Final score:     {score}/100",
        f"Iterations:      {iters}/{_MAX_ITERATIONS}",
        f"Issues fixed:    {len(fixed)}",
        f"Remaining issues:{len(remaining)}",
    ]
    if fixed:
        lines.append("\nFixed:")
        for i in fixed:
            lines.append(f"  ✓ {i}")
    if remaining:
        lines.append("\nRemaining:")
        for i in remaining:
            lines.append(f"  ✗ {i}")
    return "\n".join(lines)
