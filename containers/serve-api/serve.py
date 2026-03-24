#!/usr/bin/env python3
"""
DaveAI Combined Server — Static Files + Neural TTS on ONE port
===============================================================
Serves the HTML UI AND provides Edge TTS neural voices on the same
origin, eliminating all CORS issues.

Install:  pip install edge-tts fastapi uvicorn
Run:      python serve.py
Open:     http://localhost:8090/daveai-ui-v6.html

The Voice Studio's default TTS URL (/api/tts) will just work —
no configuration needed. Crystal clear Microsoft Neural voices.
"""

import asyncio
import io
import os
import sys

# ── Auto-install deps ──
for pkg, imp in [("edge_tts", "edge-tts"), ("fastapi", "fastapi"), ("uvicorn", "uvicorn")]:
    try:
        __import__(pkg)
    except ImportError:
        print(f"Installing {imp}...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", imp])

import edge_tts
from fastapi import FastAPI, Request
from fastapi.responses import Response, JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DaveAI Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Directory where this script lives (serves static files from here)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Kokoro voice ID → Edge TTS neural voice mapping ──
VOICE_MAP = {
    # British Female
    "bf_emma": "en-GB-SoniaNeural", "bf_isabella": "en-GB-LibbyNeural",
    "bf_alice": "en-GB-MaisieNeural", "bf_lily": "en-GB-SoniaNeural",
    # British Male
    "bm_george": "en-GB-RyanNeural", "bm_fable": "en-GB-ThomasNeural",
    "bm_daniel": "en-GB-RyanNeural", "bm_lewis": "en-GB-ThomasNeural",
    # American Female
    "af_heart": "en-US-JennyNeural", "af_bella": "en-US-AriaNeural",
    "af_nicole": "en-US-SaraNeural", "af_aoede": "en-US-AriaNeural",
    "af_kore": "en-US-JennyNeural", "af_sarah": "en-US-SaraNeural",
    "af_sky": "en-US-JennyNeural", "af_nova": "en-US-AriaNeural",
    # American Male
    "am_fenrir": "en-US-GuyNeural", "am_michael": "en-US-DavisNeural",
    "am_puck": "en-US-JasonNeural", "am_eric": "en-US-DavisNeural",
    "am_onyx": "en-US-GuyNeural", "am_liam": "en-US-JasonNeural",
}


@app.get("/health")
@app.get("/api/tts/health")
@app.get("/api/edge-tts/health")
async def health():
    return {"status": "ok", "engine": "edge-tts", "voices": len(VOICE_MAP)}


@app.post("/api/tts")
async def tts_main(request: Request):
    """OpenAI-compatible TTS endpoint — same format Kokoro-FastAPI uses."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    text = body.get("input", "") or body.get("text", "")
    voice_id = body.get("voice", "bf_emma")
    speed = body.get("speed", 1.0)

    if not text or not text.strip():
        return JSONResponse({"error": "No input text provided"}, status_code=400)

    # Map Kokoro voice ID to Edge TTS neural voice
    edge_voice = VOICE_MAP.get(voice_id, voice_id)
    # If they passed an Edge voice name directly, use it
    if edge_voice == voice_id and not edge_voice.endswith("Neural"):
        edge_voice = "en-GB-SoniaNeural"  # safe default

    # Speed: convert multiplier to Edge TTS rate string
    rate = f"+{int((speed - 1) * 100)}%" if speed >= 1 else f"{int((speed - 1) * 100)}%"

    try:
        communicate = edge_tts.Communicate(text.strip(), edge_voice, rate=rate)
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])

        audio_bytes = audio_data.getvalue()
        if len(audio_bytes) < 100:
            return JSONResponse({"error": "Empty audio response"}, status_code=500)

        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        return JSONResponse({"error": f"TTS failed: {str(e)}"}, status_code=500)


@app.post("/api/edge-tts")
async def tts_edge_direct(request: Request):
    """Direct Edge TTS endpoint."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    text = body.get("text", "")
    voice = body.get("voice", "en-GB-SoniaNeural")
    rate = body.get("rate", "+0%")

    if not text or not text.strip():
        return JSONResponse({"error": "No text"}, status_code=400)

    try:
        communicate = edge_tts.Communicate(text.strip(), voice, rate=rate)
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        return Response(content=audio_data.getvalue(), media_type="audio/mpeg")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/voices")
async def list_voices():
    """List all available Edge TTS voices."""
    try:
        voices = await edge_tts.list_voices()
        english = [v for v in voices if v["Locale"].startswith("en-")]
        return {"voices": english, "total": len(english), "mapped": len(VOICE_MAP)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/games")
async def list_games():
    games = [
        {"id":"daves-siege-td","title":"Dave's Siege TD","subtitle":"Classic tower defense!","url":"/games/daves-siege-td/index.html","category":"strategy","featured":True,"status":"live"},
        {"id":"daveai-td2","title":"DaveAI TD2","subtitle":"Advanced TD - 11 worlds!","url":"/games/daveai-td2/index.html","category":"strategy","featured":True,"status":"live"},
        {"id":"asteroids","title":"DaveAI Asteroids","subtitle":"Space adventure!","url":"/games/asteroids/index.html","category":"action","featured":True,"status":"live"},
        {"id":"gangster-wars","title":"Gangster Wars","subtitle":"Gangster action!","url":"/gangster-wars/index.html","category":"action","featured":True,"status":"live"},
        {"id":"slitherworm","title":"Slither Plus","subtitle":"Snake game!","url":"/games/slitherworm/index.html","category":"arcade","featured":True,"status":"live"}
    ]
    return {"games": games, "total": len(games)}


# ── Catch-all: serve static files from BASE_DIR ──
@app.get("/{path:path}")
async def serve_static(path: str):
    if not path or path == "/":
        path = "daveai-ui-v6.html"

    file_path = os.path.join(BASE_DIR, path)

    # Security: prevent directory traversal
    real_base = os.path.realpath(BASE_DIR)
    real_file = os.path.realpath(file_path)
    if not real_file.startswith(real_base):
        return JSONResponse({"error": "Forbidden"}, status_code=403)

    if os.path.isfile(file_path):
        return FileResponse(file_path)

    return JSONResponse({"error": "Not found"}, status_code=404)


if __name__ == "__main__":
    import uvicorn
    port = 8090
    print()
    print("╔════════════════════════════════════════════════════════════╗")
    print("║  DaveAI Server — Static Files + Neural TTS (Edge TTS)    ║")
    print(f"║  http://localhost:{port}/daveai-ui-v6.html                  ║")
    print("║                                                            ║")
    print("║  TTS API: /api/tts  (same port, no CORS issues)           ║")
    print("║  Health:  /health                                          ║")
    print("║  Voices:  /api/voices                                      ║")
    print("║                                                            ║")
    print("║  All 22 Kokoro voices → Microsoft Neural voices            ║")
    print("║  Crystal clear, natural sounding, zero API keys            ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print()
    uvicorn.run(app, host="0.0.0.0", port=port)
