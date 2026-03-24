"""brain_assets.py — Asset generation agent for DaveAI pipeline.

Handles image generation, icon fetching, font loading, and image optimization.
All external calls use urllib.request only (no httpx/requests dependency).

Asset chain (triple failsafe per asset type):
    Images:  Stable Diffusion (local) → Unsplash API → SVG placeholder
    Icons:   Iconify REST API → Heroicons CDN → inline SVG fallback
    Fonts:   Google Fonts API URL builder (always works, no API key needed)

Usage:
    from brain_assets import generate_image, fetch_icon, get_google_font_url

    img = generate_image("modern hero background, tech, blue gradient")
    icon = fetch_icon("heroicons:star-solid", size=24)
    font_url = get_google_font_url(["Inter", "Playfair Display"], weights=[400, 700])
"""

import base64
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────
_WORKSPACE      = os.getenv("WORKSPACE", "/var/www/agentic-website")
_ASSETS_DIR     = os.path.join(_WORKSPACE, "public", "assets", "generated")
_SD_URL         = os.getenv("SD_URL", "http://localhost:7860")   # Stable Diffusion WebUI
_UNSPLASH_KEY   = os.getenv("UNSPLASH_ACCESS_KEY", "")
_ICONIFY_CDN    = "https://api.iconify.design"
_HEROICONS_CDN  = "https://unpkg.com/heroicons@2.0.18/24/solid"
_TIMEOUT        = 20
_SD_TIMEOUT     = 90

Path(_ASSETS_DIR).mkdir(parents=True, exist_ok=True)


# ── Image generation ──────────────────────────────────────────────────────────
def generate_image(
    prompt: str,
    width: int = 1200,
    height: int = 630,
    filename: Optional[str] = None,
) -> dict:
    """
    Generate an image for the given prompt.

    Triple failsafe:
        1. Stable Diffusion local API
        2. Unsplash stock photo search
        3. SVG gradient placeholder

    Returns:
        {
            "ok": bool,
            "path": str,         # relative to /public
            "source": str,       # "sd" | "unsplash" | "svg"
            "width": int,
            "height": int,
        }
    """
    fname = filename or _slugify(prompt)[:40] + f"_{int(time.time())}.png"

    # ── Failsafe 1: Stable Diffusion ────────────────────────────────────────
    try:
        result = _generate_sd(prompt, width, height, fname)
        if result["ok"]:
            return result
    except Exception as e:
        print(f"[assets] SD failed: {e}")

    # ── Failsafe 2: Unsplash ─────────────────────────────────────────────────
    try:
        result = _fetch_unsplash(prompt, width, height, fname)
        if result["ok"]:
            return result
    except Exception as e:
        print(f"[assets] Unsplash failed: {e}")

    # ── Failsafe 3: SVG placeholder ──────────────────────────────────────────
    return _svg_placeholder(prompt, width, height, fname.replace(".png", ".svg"))


def _generate_sd(prompt: str, width: int, height: int, fname: str) -> dict:
    """Call Stable Diffusion WebUI txt2img API."""
    payload = json.dumps({
        "prompt": prompt,
        "negative_prompt": "blurry, low quality, watermark, text, logo",
        "width": min(width, 1024),
        "height": min(height, 1024),
        "steps": 20,
        "cfg_scale": 7,
        "sampler_name": "Euler a",
        "n_iter": 1,
        "batch_size": 1,
    }).encode()

    req = urllib.request.Request(
        f"{_SD_URL}/sdapi/v1/txt2img",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=_SD_TIMEOUT) as resp:
        data = json.loads(resp.read())

    img_b64 = data["images"][0]
    img_bytes = base64.b64decode(img_b64)
    out_path = os.path.join(_ASSETS_DIR, fname)

    with open(out_path, "wb") as f:
        f.write(img_bytes)

    rel_path = "/assets/generated/" + fname
    return {"ok": True, "path": rel_path, "source": "sd", "width": width, "height": height}


def _fetch_unsplash(prompt: str, width: int, height: int, fname: str) -> dict:
    """Fetch a photo from Unsplash matching the prompt."""
    if not _UNSPLASH_KEY:
        raise RuntimeError("UNSPLASH_ACCESS_KEY not set")

    query = urllib.parse.quote(prompt[:100])
    url = (
        f"https://api.unsplash.com/photos/random"
        f"?query={query}&orientation=landscape&w={width}&h={height}"
        f"&client_id={_UNSPLASH_KEY}"
    )
    req = urllib.request.Request(url, headers={"Accept-Version": "v1"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read())

    photo_url = data["urls"]["regular"]
    img_req = urllib.request.Request(photo_url)
    with urllib.request.urlopen(img_req, timeout=_TIMEOUT) as resp:
        img_bytes = resp.read()

    out_path = os.path.join(_ASSETS_DIR, fname)
    with open(out_path, "wb") as f:
        f.write(img_bytes)

    rel_path = "/assets/generated/" + fname
    attribution = data.get("user", {}).get("name", "Unsplash")
    return {
        "ok": True, "path": rel_path, "source": "unsplash",
        "width": width, "height": height, "attribution": attribution,
    }


def _svg_placeholder(prompt: str, width: int, height: int, fname: str) -> dict:
    """Generate a gradient SVG placeholder image."""
    # Pick gradient colors based on prompt keywords
    colors = _prompt_to_colors(prompt)
    label  = prompt[:30].title()

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:{colors[0]};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:{colors[1]};stop-opacity:1"/>
    </linearGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="system-ui, sans-serif" font-size="24" fill="rgba(255,255,255,0.6)">
    {label}
  </text>
</svg>"""

    out_path = os.path.join(_ASSETS_DIR, fname)
    with open(out_path, "w") as f:
        f.write(svg)

    rel_path = "/assets/generated/" + fname
    return {"ok": True, "path": rel_path, "source": "svg", "width": width, "height": height}


# ── Icon fetching ─────────────────────────────────────────────────────────────
def fetch_icon(icon_id: str, size: int = 24, color: str = "currentColor") -> str:
    """
    Fetch an SVG icon string.

    Args:
        icon_id:  Iconify format "prefix:name" e.g. "heroicons:star-solid"
                  or simple name e.g. "star" (tries heroicons)
        size:     Icon size in pixels
        color:    Fill color

    Returns:
        SVG string (always returns valid SVG via fallback)
    """
    # ── Failsafe 1: Iconify CDN ──────────────────────────────────────────────
    try:
        svg = _iconify_fetch(icon_id, size, color)
        if svg:
            return svg
    except Exception as e:
        print(f"[assets] Iconify failed: {e}")

    # ── Failsafe 2: Heroicons CDN ────────────────────────────────────────────
    try:
        name = icon_id.split(":")[-1]
        svg = _heroicons_fetch(name, size, color)
        if svg:
            return svg
    except Exception as e:
        print(f"[assets] Heroicons failed: {e}")

    # ── Failsafe 3: Inline SVG fallback ─────────────────────────────────────
    return _generic_icon_svg(size, color)


def _iconify_fetch(icon_id: str, size: int, color: str) -> str:
    """Fetch from Iconify CDN."""
    encoded_color = urllib.parse.quote(color)
    url = f"{_ICONIFY_CDN}/{icon_id}.svg?width={size}&height={size}&color={encoded_color}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return resp.read().decode()


def _heroicons_fetch(name: str, size: int, color: str) -> str:
    """Fetch from Heroicons CDN."""
    url = f"{_HEROICONS_CDN}/{name}.svg"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        svg = resp.read().decode()
    # Inject size and color
    svg = re.sub(r'width="\d+"', f'width="{size}"', svg)
    svg = re.sub(r'height="\d+"', f'height="{size}"', svg)
    if color != "currentColor":
        svg = svg.replace('currentColor', color)
    return svg


def _generic_icon_svg(size: int, color: str) -> str:
    """Return a generic placeholder icon."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2">'
        f'<circle cx="12" cy="12" r="10"/>'
        f'<line x1="12" y1="8" x2="12" y2="12"/>'
        f'<line x1="12" y1="16" x2="12.01" y2="16"/>'
        f'</svg>'
    )


def save_icon_to_file(icon_id: str, dest_path: str, size: int = 24) -> str:
    """Fetch icon and save to a file. Returns the saved path."""
    svg = fetch_icon(icon_id, size)
    full_path = os.path.join(_WORKSPACE, dest_path.lstrip("/"))
    Path(full_path).parent.mkdir(parents=True, exist_ok=True)
    with open(full_path, "w") as f:
        f.write(svg)
    return dest_path


# ── Google Fonts ──────────────────────────────────────────────────────────────
def get_google_font_url(
    families: list[str],
    weights: list[int] = None,
    display: str = "swap",
) -> str:
    """
    Build a Google Fonts CSS2 URL for the given font families.
    No API key required.

    Args:
        families:  List of font family names, e.g. ["Inter", "Playfair Display"]
        weights:   List of weights, e.g. [400, 700]. Defaults to [400, 700]
        display:   font-display value (swap, block, optional)

    Returns:
        Google Fonts URL string (always valid)

    Example:
        >>> get_google_font_url(["Inter", "Playfair Display"], [300, 400, 700])
        'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&family=...'
    """
    if not weights:
        weights = [400, 700]

    weight_str = ";".join(str(w) for w in sorted(weights))
    params = []

    for family in families:
        encoded = urllib.parse.quote(family.strip())
        params.append(f"family={encoded}:wght@{weight_str}")

    query = "&".join(params) + f"&display={display}"
    return f"https://fonts.googleapis.com/css2?{query}"


# ── Image optimization ────────────────────────────────────────────────────────
def optimize_image(src_path: str, quality: int = 85) -> dict:
    """
    Optimize an image using available tools.

    Tries: sharp (Node) → Pillow (Python) → copy as-is

    Returns:
        {"ok": bool, "path": str, "original_kb": int, "optimized_kb": int}
    """
    abs_path = os.path.join(_WORKSPACE, src_path.lstrip("/"))
    if not os.path.exists(abs_path):
        return {"ok": False, "path": src_path, "error": "file not found"}

    original_kb = os.path.getsize(abs_path) // 1024
    out_path    = abs_path.replace(".png", ".webp").replace(".jpg", ".webp")

    # Try sharp (Node.js)
    try:
        script = f"""
const sharp = require('sharp');
sharp('{abs_path}')
  .webp({{quality: {quality}}})
  .toFile('{out_path}')
  .then(i => console.log(JSON.stringify(i)))
  .catch(e => process.exit(1));
"""
        tmpf = f"/tmp/_sharp_{int(time.time())}.js"
        with open(tmpf, "w") as f:
            f.write(script)
        r = subprocess.run(["node", tmpf], capture_output=True, text=True, timeout=30)
        if r.returncode == 0 and os.path.exists(out_path):
            optimized_kb = os.path.getsize(out_path) // 1024
            os.unlink(tmpf)
            rel_path = src_path.rsplit(".", 1)[0] + ".webp"
            return {"ok": True, "path": rel_path,
                    "original_kb": original_kb, "optimized_kb": optimized_kb}
    except Exception:
        pass

    # Try Pillow (Python)
    try:
        import importlib
        pil = importlib.import_module("PIL.Image")
        img = pil.open(abs_path)
        img.save(out_path, "WEBP", quality=quality, method=6)
        optimized_kb = os.path.getsize(out_path) // 1024
        rel_path = src_path.rsplit(".", 1)[0] + ".webp"
        return {"ok": True, "path": rel_path,
                "original_kb": original_kb, "optimized_kb": optimized_kb}
    except Exception:
        pass

    # Fallback: return original
    return {"ok": True, "path": src_path,
            "original_kb": original_kb, "optimized_kb": original_kb,
            "note": "optimization unavailable, returned original"}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _slugify(text: str) -> str:
    """Convert text to a safe filename slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text


def _prompt_to_colors(prompt: str) -> tuple[str, str]:
    """Map prompt keywords to gradient colors."""
    p = prompt.lower()
    if any(w in p for w in ("tech", "digital", "code", "software")):
        return ("#0f172a", "#1e40af")
    elif any(w in p for w in ("nature", "green", "eco", "organic")):
        return ("#064e3b", "#059669")
    elif any(w in p for w in ("sunset", "warm", "orange", "fire")):
        return ("#7c2d12", "#ea580c")
    elif any(w in p for w in ("purple", "luxury", "premium", "elegant")):
        return ("#2e1065", "#7c3aed")
    elif any(w in p for w in ("pink", "feminine", "beauty", "fashion")):
        return ("#831843", "#db2777")
    else:
        return ("#1e293b", "#0f766e")
