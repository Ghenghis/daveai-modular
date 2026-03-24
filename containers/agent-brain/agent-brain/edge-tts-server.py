#!/usr/bin/env python3
"""
DaveAI Edge TTS Server — Free Microsoft Neural Voices
======================================================
Provides crystal-clear neural TTS with zero API keys.
Uses Microsoft Edge's Read Aloud voices (same quality as Azure TTS).

Install:  pip install edge-tts fastapi uvicorn
Run:      python edge-tts-server.py
Then:     Set Voice Studio TTS URL to http://localhost:5050/api/tts

Available voices (all neural) — 60/40 British Female/Male ratio:
  British Female:  en-GB-SoniaNeural, en-GB-LibbyNeural, en-GB-MaisieNeural,
                   en-GB-AbbiNeural, en-GB-BellaNeural, en-GB-HollieNeural,
                   en-GB-OliviaNeural
  British Male:    en-GB-RyanNeural, en-GB-ThomasNeural, en-GB-AlfieNeural,
                   en-GB-ElliotNeural, en-GB-OliverNeural
  American Female: en-US-JennyNeural, en-US-AriaNeural, en-US-SaraNeural
  American Male:   en-US-GuyNeural, en-US-DavisNeural, en-US-JasonNeural

Default voice: Alice (bf_alice) → en-GB-MaisieNeural (refined, elegant British)
"""

import asyncio
import io
import sys

try:
    import edge_tts
except ImportError:
    print("Installing edge-tts...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "edge-tts"])
    import edge_tts

try:
    from fastapi import FastAPI, Request
    from fastapi.responses import Response, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
except ImportError:
    print("Installing fastapi + uvicorn...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "fastapi", "uvicorn"])
    from fastapi import FastAPI, Request
    from fastapi.responses import Response, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DaveAI Edge TTS Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Default voice — Alice is the star
DEFAULT_VOICE = "bf_alice"

# Kokoro voice ID → Edge TTS neural voice mapping
# 60/40 British Female / Male ratio — Alice (MaisieNeural) is default
VOICE_MAP = {
    # ── British Female — only 3 exist in Edge TTS ──
    "bf_alice":    "en-GB-MaisieNeural",   # ★ DEFAULT — refined, elegant, young British
    "bf_emma":     "en-GB-SoniaNeural",    # warm, professional British
    "bf_isabella": "en-GB-LibbyNeural",    # sophisticated, clear British
    # ── British-style Female (remapped to en-US neural voices) ──
    "bf_charlotte":"en-US-EmmaNeural",     # confident, articulate (Emma US ≈ British tone)
    "bf_sophia":   "en-US-AriaNeural",     # bright, expressive
    "bf_lily":     "en-US-AvaNeural",      # sweet, gentle
    "bf_olivia":   "en-US-MichelleNeural", # poised, elegant
    # ── British Male — only 2 exist in Edge TTS ──
    "bm_george":   "en-GB-RyanNeural",     # authoritative, warm British
    "bm_fable":    "en-GB-ThomasNeural",   # storyteller, deep British
    # ── British-style Male (remapped to en-US neural voices) ──
    "bm_daniel":   "en-US-AndrewNeural",   # friendly, modern
    "bm_lewis":    "en-US-BrianNeural",    # calm, thoughtful
    "bm_oliver":   "en-US-ChristopherNeural", # clear, professional
    # ── American Female ──
    "af_heart":    "en-US-JennyNeural",
    "af_bella":    "en-US-AriaNeural",
    "af_nicole":   "en-US-AnaNeural",
    "af_sarah":    "en-US-AvaNeural",
    # ── American Male ──
    "am_fenrir":   "en-US-GuyNeural",
    "am_michael":  "en-US-EricNeural",
    "am_puck":     "en-US-RogerNeural",
}

# Voice metadata for the UI Voice Studio
VOICE_META = {
    "bf_alice":     {"name": "Alice",     "gender": "female", "accent": "british", "style": "Refined and elegant",         "default": True},
    "bf_emma":      {"name": "Emma",      "gender": "female", "accent": "british", "style": "Warm and professional"},
    "bf_isabella":  {"name": "Isabella",  "gender": "female", "accent": "british", "style": "Sophisticated and clear"},
    "bf_lily":      {"name": "Lily",      "gender": "female", "accent": "british", "style": "Sweet and gentle"},
    "bf_charlotte": {"name": "Charlotte", "gender": "female", "accent": "british", "style": "Confident and articulate"},
    "bf_sophia":    {"name": "Sophia",    "gender": "female", "accent": "british", "style": "Bright and expressive"},
    "bf_olivia":    {"name": "Olivia",    "gender": "female", "accent": "british", "style": "Poised and elegant"},
    "bm_george":    {"name": "George",    "gender": "male",   "accent": "british", "style": "Authoritative and warm"},
    "bm_fable":     {"name": "Fable",     "gender": "male",   "accent": "british", "style": "Storyteller, deep"},
    "bm_daniel":    {"name": "Daniel",    "gender": "male",   "accent": "british", "style": "Friendly and modern"},
    "bm_lewis":     {"name": "Lewis",     "gender": "male",   "accent": "british", "style": "Calm and thoughtful"},
    "bm_oliver":    {"name": "Oliver",    "gender": "male",   "accent": "british", "style": "Clear and professional"},
    "af_heart":     {"name": "Heart",     "gender": "female", "accent": "american", "style": "Friendly and warm"},
    "af_bella":     {"name": "Bella",     "gender": "female", "accent": "american", "style": "Expressive and clear"},
    "af_nicole":    {"name": "Nicole",    "gender": "female", "accent": "american", "style": "Professional"},
    "af_sarah":     {"name": "Sarah",     "gender": "female", "accent": "american", "style": "Natural and warm"},
    "am_fenrir":    {"name": "Fenrir",    "gender": "male",   "accent": "american", "style": "Strong and confident"},
    "am_michael":   {"name": "Michael",   "gender": "male",   "accent": "american", "style": "Smooth and professional"},
    "am_puck":      {"name": "Puck",      "gender": "male",   "accent": "american", "style": "Energetic and dynamic"},
}


@app.get("/api/tts/health")
@app.get("/api/edge-tts/health")
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine": "edge-tts",
        "voices": len(VOICE_MAP),
        "default_voice": DEFAULT_VOICE,
        "british_voices": len([k for k in VOICE_MAP if k.startswith("b")]),
    }


@app.post("/api/tts")
async def tts_kokoro_compat(request: Request):
    """OpenAI-compatible TTS endpoint (same format as Kokoro-FastAPI)."""
    body = await request.json()
    text = body.get("input") or body.get("text", "")  # accept both OpenAI "input" and generic "text"
    voice_id = body.get("voice", DEFAULT_VOICE)
    speed = body.get("speed", 1.0)
    if not text:
        return JSONResponse({"error": "No input text"}, status_code=400)
    edge_voice = VOICE_MAP.get(voice_id, voice_id)
    rate = f"+{int((speed - 1) * 100)}%" if speed >= 1 else f"{int((speed - 1) * 100)}%"
    try:
        communicate = edge_tts.Communicate(text, edge_voice, rate=rate)
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        audio_data.seek(0)
        return Response(content=audio_data.read(), media_type="audio/mpeg")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/edge-tts")
async def tts_edge(request: Request):
    """Direct Edge TTS endpoint."""
    body = await request.json()
    text = body.get("text", "")
    voice = body.get("voice", "en-GB-MaisieNeural")  # Alice's voice
    rate = body.get("rate", "+0%")
    if not text:
        return JSONResponse({"error": "No text"}, status_code=400)
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        audio_data.seek(0)
        return Response(content=audio_data.read(), media_type="audio/mpeg")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/voices")
async def list_voices():
    """List all available voices with metadata for Voice Studio UI."""
    result = []
    for vid, meta in VOICE_META.items():
        result.append({
            "id": vid,
            "edge_voice": VOICE_MAP.get(vid, ""),
            **meta,
            "default": meta.get("default", False),
        })
    # Sort: default first, then british female, british male, american
    def sort_key(v):
        accent_order = {"british": 0, "american": 1}
        gender_order = {"female": 0, "male": 1}
        return (0 if v.get("default") else 1,
                accent_order.get(v["accent"], 2),
                gender_order.get(v["gender"], 2),
                v["name"])
    result.sort(key=sort_key)
    return {
        "voices": result,
        "total": len(result),
        "default": DEFAULT_VOICE,
        "british_female": len([v for v in result if v["accent"]=="british" and v["gender"]=="female"]),
        "british_male": len([v for v in result if v["accent"]=="british" and v["gender"]=="male"]),
    }


@app.get("/api/voices/british")
async def list_british_voices():
    """List only British voices (the preferred set)."""
    result = []
    for vid, meta in VOICE_META.items():
        if meta["accent"] == "british":
            result.append({"id": vid, "edge_voice": VOICE_MAP.get(vid, ""), **meta})
    return {"voices": result, "total": len(result)}


# Agent-to-voice default mapping (synced with PixelPaw AGENT_TEMPLATES)
AGENT_VOICE_MAP = {
    "orchestrator": {"displayName": "Alice",     "voiceId": "bf_alice",     "greeting": "Hello! I'm Alice, your AI assistant from DaveAI."},
    "code":         {"displayName": "Charlotte",  "voiceId": "bf_charlotte", "greeting": "Hi there! I'm Charlotte, your coding specialist."},
    "reasoning":    {"displayName": "George",     "voiceId": "bm_george",    "greeting": "Good day! I'm George, here to help you think through problems."},
    "vision":       {"displayName": "Sophia",     "voiceId": "bf_sophia",    "greeting": "Hi! I'm Sophia, your visual analysis expert."},
    "tool_use":     {"displayName": "Daniel",     "voiceId": "bm_daniel",    "greeting": "Hey! I'm Daniel, your tool and automation specialist."},
    "chat":         {"displayName": "Emma",       "voiceId": "bf_emma",      "greeting": "Hello! I'm Emma, here to chat and help."},
    "evony":        {"displayName": "Oliver",     "voiceId": "bm_oliver",    "greeting": "Greetings, Commander! I'm Oliver, your Evony strategist."},
}


@app.get("/api/agents/voices")
async def agent_voice_defaults():
    """Return agent-to-voice mapping for PixelPaw/DaveAI bridge sync."""
    return {
        "agents": AGENT_VOICE_MAP,
        "default_agent": "orchestrator",
        "default_voice": DEFAULT_VOICE,
        "total": len(AGENT_VOICE_MAP),
    }


@app.get("/api/voices/all-edge")
async def list_all_edge_voices():
    """List ALL available Edge TTS English voices (for discovery)."""
    voices = await edge_tts.list_voices()
    english = [v for v in voices if v["Locale"].startswith("en-")]
    return {"voices": english, "total": len(english)}


if __name__ == "__main__":
    import uvicorn
    print("\n╔══════════════════════════════════════════════════╗")
    print("║   DaveAI Edge TTS Server — Neural Voices Free   ║")
    print("║   http://localhost:5050                          ║")
    print("║   Set Voice Studio URL: http://localhost:5050/api/tts  ║")
    print("╚══════════════════════════════════════════════════╝\n")
    uvicorn.run(app, host="0.0.0.0", port=5050)
