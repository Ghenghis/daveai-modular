"""brain_pipelines.py — Multi-pipeline API helpers for ComfyUI, TTS, Embedding.
Agents call these functions to route tasks to the appropriate pipeline
instead of sending everything through the LLM.

Pipelines:
  1. LLM      — LM Studio via LiteLLM (existing brain_llm.py)
  2. ComfyUI  — Image/video gen, editing, upscaling (localhost:8188)
  3. TTS      — Voice synthesis — multi-backend:
       AllTalk (7851), Chatterbox (8003), Fish Speech (8080),
       GPT-SoVITS (9880), Orpheus (library), Kokoro (library),
       KoboldCpp (5001), OuteTTS GGUF (5050)
  4. Embed    — Embedding/reranking for RAG (localhost:1234 or dedicated)

See MODEL_DB_PART6_VOICE_TOOLS.md for full voice tools inventory.
"""
import os, json, time, uuid, logging, re
from typing import Optional
from enum import Enum

log = logging.getLogger("brain.pipelines")

# ── Pipeline endpoints (configurable via env) ────────────────────────────────
COMFYUI_BASE   = os.getenv("COMFYUI_URL",     "http://localhost:8188")
TTS_BASE       = os.getenv("TTS_URL",         "http://localhost:5050")
EMBED_BASE     = os.getenv("EMBED_URL",       "http://localhost:1234")
ALLTALK_BASE   = os.getenv("ALLTALK_URL",     "http://localhost:7851")
CHATTERBOX_BASE= os.getenv("CHATTERBOX_URL",  "http://localhost:8003")
FISHSPEECH_BASE= os.getenv("FISHSPEECH_URL",  "http://localhost:8080")
GPTSOVITS_BASE = os.getenv("GPTSOVITS_URL",   "http://localhost:9880")
KOBOLDCPP_BASE = os.getenv("KOBOLDCPP_URL",   "http://localhost:5001")


class Pipeline(str, Enum):
    LLM        = "llm"
    IMAGE      = "image"
    VIDEO      = "video"
    EDIT       = "edit"
    TTS        = "tts"
    TTS_CLONE  = "tts_clone"
    TTS_BOOK   = "tts_audiobook"
    EMBED      = "embed"
    UPSCALE    = "upscale"
    OCR        = "ocr"


class TTSBackend(str, Enum):
    """Available TTS backends discovered on G:\\"""
    OUTETTS    = "outetts"       # GGUF via KoboldCpp/dedicated, fast
    ALLTALK    = "alltalk"       # Multi-engine (XTTS, F5, Piper, VITS, Parler, RVC)
    CHATTERBOX = "chatterbox"    # OpenAI-compatible, voice cloning, audiobooks
    FISH       = "fish_speech"   # #1 TTS Arena, 13 languages
    GPTSOVITS  = "gpt_sovits"    # Few-shot voice cloning (1 min training)
    ORPHEUS    = "orpheus"       # Llama-3B, emotion tags, streaming
    KOKORO     = "kokoro"        # 82M ONNX, 90x realtime, lightweight
    KOBOLDCPP  = "koboldcpp"     # Built-in TTS via GGUF models


# ── Task classification keywords ─────────────────────────────────────────────
_PIPELINE_KEYWORDS: dict[Pipeline, list[str]] = {
    Pipeline.IMAGE: [
        "generate image", "create image", "draw", "illustration", "render",
        "photo of", "picture of", "artwork", "portrait", "landscape",
        "sdxl", "stable diffusion", "juggernaut", "pony diffusion",
        "cyberrealistic", "noobai", "checkpoint", "img2img",
    ],
    Pipeline.VIDEO: [
        "generate video", "create video", "animate", "animation",
        "text to video", "t2v", "image to video", "i2v",
        "wan2.1", "hunyuan", "ltx", "motion", "cinematic",
    ],
    Pipeline.EDIT: [
        "edit image", "modify image", "change the", "replace the",
        "remove from image", "add to image", "lucy edit", "qwen image edit",
        "inpaint", "outpaint", "style transfer",
    ],
    Pipeline.TTS: [
        "speak", "say this", "read aloud", "text to speech", "tts",
        "narrate", "synthesize speech", "generate speech",
        "outetts", "soulx", "kokoro", "alltalk", "piper",
        "fish speech", "orpheus", "chatterbox",
    ],
    Pipeline.TTS_CLONE: [
        "clone voice", "voice clone", "clone my voice", "sound like",
        "mimic voice", "voice cloning", "copy voice", "replicate voice",
        "gpt-sovits", "gptsovits", "few-shot voice", "zero-shot voice",
        "reference audio", "voice sample",
    ],
    Pipeline.TTS_BOOK: [
        "audiobook", "read book", "read the book", "narrate book",
        "book to audio", "epub to audio", "pdf to audio",
        "podcast", "long narration", "chapter", "batch tts",
    ],
    Pipeline.EMBED: [
        "embed", "embedding", "semantic search", "similarity",
        "rag", "retrieve", "rerank", "vector", "cosine",
    ],
    Pipeline.UPSCALE: [
        "upscale", "enhance", "super resolution", "4x", "ultrasharp",
        "esrgan", "increase resolution", "enlarge",
    ],
    Pipeline.OCR: [
        "ocr", "extract text", "read text from image", "document scan",
        "nanonets", "image to text", "pdf to text",
    ],
}


def classify_pipeline(prompt: str) -> Pipeline:
    """Classify a user prompt into the appropriate pipeline."""
    low = prompt.lower()
    scores: dict[Pipeline, int] = {}
    for pipe, keywords in _PIPELINE_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in low)
        if score > 0:
            scores[pipe] = score
    if not scores:
        return Pipeline.LLM
    return max(scores, key=scores.get)


# ── ComfyUI API helpers ──────────────────────────────────────────────────────

# Default checkpoint models by style
CHECKPOINTS = {
    "realistic":  "juggernautXL_v9.safetensors",
    "anime":      "ponyDiffusionV6XL.safetensors",
    "fast":       "CyberRealistic.safetensors",
    "noobai":     "NoobAI-XL-v1.0.safetensors",
    "sdxl_base":  "sd_xl_base_1.0.safetensors",
}

# Default LoRAs for speed/quality
SPEED_LORAS = {
    "sdxl_fast": {"name": "Hyper-SDXL-8steps-lora.safetensors", "strength": 1.0},
}

VIDEO_MODELS = {
    "wan2.1_t2v":     "wan2.1-t2v-14b",
    "hunyuan_i2v":    "hunyuanvideo1.5_720p_i2v_cfg_distilled-Q6_K.gguf",
}

UPSCALE_MODELS = {
    "ultrasharp":     "4x-UltraSharp.pth",
    "realesrgan":     "RealESRGAN_x4plus.pth",
}


def _http_post(url: str, data: dict, timeout: int = 120) -> dict:
    """HTTP POST with JSON body. Returns parsed JSON or error dict."""
    import urllib.request
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        log.error("POST %s failed: %s", url, e)
        return {"error": str(e)}


def _http_get(url: str, timeout: int = 30) -> dict:
    """HTTP GET. Returns parsed JSON or error dict."""
    import urllib.request
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        log.error("GET %s failed: %s", url, e)
        return {"error": str(e)}


def comfyui_health() -> dict:
    """Check if ComfyUI is running and responsive."""
    return _http_get(f"{COMFYUI_BASE}/api/system_stats")


def comfyui_queue_prompt(workflow: dict) -> dict:
    """Submit a ComfyUI workflow for execution. Returns prompt_id."""
    client_id = str(uuid.uuid4())
    payload = {"prompt": workflow, "client_id": client_id}
    result = _http_post(f"{COMFYUI_BASE}/api/prompt", payload, timeout=10)
    if "error" not in result:
        result["client_id"] = client_id
    return result


def comfyui_get_history(prompt_id: str) -> dict:
    """Get execution history/results for a prompt_id."""
    return _http_get(f"{COMFYUI_BASE}/api/history/{prompt_id}")


def comfyui_wait_for_result(prompt_id: str, timeout: int = 300, poll: float = 2.0) -> dict:
    """Poll ComfyUI until the prompt finishes or times out."""
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        history = comfyui_get_history(prompt_id)
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(poll)
    return {"error": f"Timeout waiting for prompt {prompt_id} after {timeout}s"}


def comfyui_generate_image(
    prompt_text: str,
    negative: str = "",
    style: str = "realistic",
    width: int = 1024,
    height: int = 1024,
    steps: int = 25,
    cfg: float = 7.0,
    seed: int = -1,
    use_speed_lora: bool = False,
) -> dict:
    """Build and submit an SDXL text-to-image workflow to ComfyUI.
    Returns: {"prompt_id": ..., "client_id": ...} or {"error": ...}
    """
    checkpoint = CHECKPOINTS.get(style, CHECKPOINTS["realistic"])

    # Auto-adjust for SD 1.5
    if "CyberRealistic" in checkpoint or "RealisticVision" in checkpoint:
        width = min(width, 768)
        height = min(height, 768)

    if use_speed_lora and style != "fast":
        steps = 8

    if seed == -1:
        import random
        seed = random.randint(0, 2**32 - 1)

    workflow = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": checkpoint},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt_text,
                "clip": ["1", 1],
            },
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative or "ugly, blurry, low quality, deformed",
                "clip": ["1", 1],
            },
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
                "seed": seed,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal",
                "denoise": 1.0,
            },
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": f"agent_{style}",
            },
        },
    }

    return comfyui_queue_prompt(workflow)


def comfyui_upscale(image_path: str, model: str = "ultrasharp") -> dict:
    """Submit an upscale workflow. image_path should be a ComfyUI-accessible path."""
    upscale_model = UPSCALE_MODELS.get(model, UPSCALE_MODELS["ultrasharp"])
    workflow = {
        "1": {
            "class_type": "LoadImage",
            "inputs": {"image": image_path},
        },
        "2": {
            "class_type": "UpscaleModelLoader",
            "inputs": {"model_name": upscale_model},
        },
        "3": {
            "class_type": "ImageUpscaleWithModel",
            "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]},
        },
        "4": {
            "class_type": "SaveImage",
            "inputs": {"images": ["3", 0], "filename_prefix": "agent_upscaled"},
        },
    }
    return comfyui_queue_prompt(workflow)


# ── TTS API helpers (multi-backend) ──────────────────────────────────────────
# See MODEL_DB_PART6_VOICE_TOOLS.md for full inventory and quick-start commands.

# Default TTS backend preference order (first available wins)
TTS_BACKEND_PREFERENCE = [
    TTSBackend.KOKORO,      # Fastest, 82M ONNX, <1GB
    TTSBackend.OUTETTS,     # GGUF, runs alongside LLMs
    TTSBackend.ALLTALK,     # Multi-engine with RVC
    TTSBackend.CHATTERBOX,  # OpenAI-compatible, voice cloning
    TTSBackend.FISH,        # Best quality, #1 TTS Arena
    TTSBackend.KOBOLDCPP,   # Built-in TTS
]

# Backend for voice cloning tasks
TTS_CLONE_PREFERENCE = [
    TTSBackend.CHATTERBOX,  # 5-sec zero-shot cloning
    TTSBackend.GPTSOVITS,   # 1-min few-shot (best fidelity)
    TTSBackend.FISH,        # High-quality cloning
    TTSBackend.ALLTALK,     # XTTS zero-shot cloning
    TTSBackend.ORPHEUS,     # Llama-based zero-shot
]

# Backend for audiobook/long-form tasks
TTS_BOOK_PREFERENCE = [
    TTSBackend.CHATTERBOX,  # Audiobook mode, chunking, voice library
    TTSBackend.ALLTALK,     # Bulk TTS generator, narrator mode
    TTSBackend.KOKORO,      # EPUB/PDF input, chapter splitting
    TTSBackend.FISH,        # Long-form with streaming
]


def tts_health(backend: Optional[TTSBackend] = None) -> dict:
    """Check if a TTS backend is running. If None, checks default TTS_BASE."""
    urls = {
        TTSBackend.OUTETTS:    f"{TTS_BASE}/api/tts",
        TTSBackend.ALLTALK:    f"{ALLTALK_BASE}/api/ready",
        TTSBackend.CHATTERBOX: f"{CHATTERBOX_BASE}/health",
        TTSBackend.FISH:       f"{FISHSPEECH_BASE}/v1/health",
        TTSBackend.GPTSOVITS:  f"{GPTSOVITS_BASE}/",
        TTSBackend.KOBOLDCPP:  f"{KOBOLDCPP_BASE}/api/v1/model",
    }
    if backend and backend in urls:
        return _http_get(urls[backend])
    return _http_get(f"{TTS_BASE}/api/tts")


def tts_synthesize(
    text: str,
    voice: str = "af_heart",
    model: str = "outetts",
    speed: float = 1.0,
    backend: TTSBackend = TTSBackend.OUTETTS,
) -> dict:
    """Synthesize speech via the specified TTS backend.
    Returns result dict or error dict.
    """
    if backend == TTSBackend.OUTETTS:
        payload = {"model": model, "input": text, "voice": voice, "speed": speed}
        return _http_post(f"{TTS_BASE}/api/tts", payload, timeout=60)

    elif backend == TTSBackend.ALLTALK:
        payload = {
            "text_input": text,
            "text_filtering": "standard",
            "character_voice_gen": voice + ".wav" if not voice.endswith(".wav") else voice,
            "narrator_enabled": "false",
            "narrator_voice_gen": "default.wav",
            "text_not_inside": "character",
            "language": "en",
            "output_file_name": f"agent_{int(time.time())}",
            "output_file_timestamp": "true",
            "autoplay": "false",
            "autoplay_volume": 0.8,
        }
        return _http_post(f"{ALLTALK_BASE}/api/tts-generate", payload, timeout=120)

    elif backend == TTSBackend.CHATTERBOX:
        payload = {
            "text": text,
            "voice_mode": "predefined",
            "predefined_voice": voice,
            "split_text": True,
            "chunk_size": 250,
            "temperature": 0.7,
            "exaggeration": 0.5,
            "speed_factor": speed,
        }
        return _http_post(f"{CHATTERBOX_BASE}/tts", payload, timeout=120)

    elif backend == TTSBackend.FISH:
        payload = {
            "text": text,
            "reference_id": voice,
            "format": "wav",
            "streaming": False,
        }
        return _http_post(f"{FISHSPEECH_BASE}/v1/tts", payload, timeout=120)

    elif backend == TTSBackend.GPTSOVITS:
        payload = {
            "text": text,
            "text_language": "en",
            "speed": speed,
        }
        return _http_post(f"{GPTSOVITS_BASE}/tts", payload, timeout=120)

    elif backend == TTSBackend.KOBOLDCPP:
        payload = {
            "text": text,
            "voice": voice,
        }
        return _http_post(f"{KOBOLDCPP_BASE}/api/extra/generate/tts", payload, timeout=60)

    else:
        return {"error": f"Unsupported TTS backend: {backend}"}


def tts_clone_voice(
    text: str,
    reference_audio_path: str,
    backend: TTSBackend = TTSBackend.CHATTERBOX,
    speed: float = 1.0,
) -> dict:
    """Synthesize speech cloning a voice from reference audio.
    Supported backends: CHATTERBOX (5-sec), GPTSOVITS (1-min), ALLTALK (XTTS), FISH.
    """
    if backend == TTSBackend.CHATTERBOX:
        payload = {
            "text": text,
            "voice_mode": "clone",
            "reference_audio": reference_audio_path,
            "split_text": True,
            "chunk_size": 250,
            "speed_factor": speed,
        }
        return _http_post(f"{CHATTERBOX_BASE}/tts", payload, timeout=180)

    elif backend == TTSBackend.GPTSOVITS:
        payload = {
            "text": text,
            "text_language": "en",
            "refer_wav_path": reference_audio_path,
            "speed": speed,
        }
        return _http_post(f"{GPTSOVITS_BASE}/tts", payload, timeout=180)

    elif backend == TTSBackend.ALLTALK:
        payload = {
            "text_input": text,
            "character_voice_gen": reference_audio_path,
            "language": "en",
            "output_file_name": f"agent_clone_{int(time.time())}",
        }
        return _http_post(f"{ALLTALK_BASE}/api/tts-generate", payload, timeout=180)

    elif backend == TTSBackend.FISH:
        payload = {
            "text": text,
            "reference_audio": reference_audio_path,
            "format": "wav",
        }
        return _http_post(f"{FISHSPEECH_BASE}/v1/tts", payload, timeout=180)

    return {"error": f"Voice cloning not supported on backend: {backend}"}


def tts_list_voices(backend: Optional[TTSBackend] = None) -> dict:
    """List available voices on a TTS backend."""
    if backend == TTSBackend.ALLTALK:
        return _http_get(f"{ALLTALK_BASE}/api/voices")
    elif backend == TTSBackend.CHATTERBOX:
        return _http_get(f"{CHATTERBOX_BASE}/voices")
    elif backend == TTSBackend.FISH:
        return _http_get(f"{FISHSPEECH_BASE}/v1/voices")
    return _http_get(f"{TTS_BASE}/api/voices")


def tts_select_backend(prompt: str, pipeline: Pipeline = Pipeline.TTS) -> TTSBackend:
    """Select the best TTS backend for the task based on prompt keywords."""
    low = prompt.lower()

    # Explicit backend requests in prompt
    explicit_map = {
        "alltalk": TTSBackend.ALLTALK, "chatterbox": TTSBackend.CHATTERBOX,
        "fish speech": TTSBackend.FISH, "gpt-sovits": TTSBackend.GPTSOVITS,
        "gptsovits": TTSBackend.GPTSOVITS, "orpheus": TTSBackend.ORPHEUS,
        "kokoro": TTSBackend.KOKORO, "koboldcpp": TTSBackend.KOBOLDCPP,
        "outetts": TTSBackend.OUTETTS, "piper": TTSBackend.ALLTALK,
    }
    for kw, be in explicit_map.items():
        if kw in low:
            return be

    # Select preference list based on pipeline
    if pipeline == Pipeline.TTS_CLONE:
        prefs = TTS_CLONE_PREFERENCE
    elif pipeline == Pipeline.TTS_BOOK:
        prefs = TTS_BOOK_PREFERENCE
    else:
        prefs = TTS_BACKEND_PREFERENCE

    return prefs[0] if prefs else TTSBackend.OUTETTS


def tts_all_backends_status() -> dict:
    """Check health of all known TTS backends. Returns {backend: status}."""
    checks = {
        "outetts":     (TTS_BASE, "/api/tts"),
        "alltalk":     (ALLTALK_BASE, "/api/ready"),
        "chatterbox":  (CHATTERBOX_BASE, "/health"),
        "fish_speech": (FISHSPEECH_BASE, "/v1/health"),
        "gpt_sovits":  (GPTSOVITS_BASE, "/"),
        "koboldcpp":   (KOBOLDCPP_BASE, "/api/v1/model"),
    }
    status = {}
    for name, (base, path) in checks.items():
        try:
            r = _http_get(f"{base}{path}", timeout=3)
            status[name] = "online" if "error" not in r else f"error: {r['error']}"
        except Exception as e:
            status[name] = f"offline: {e}"
    return status


# ── Embedding API helpers ────────────────────────────────────────────────────

def embed_text(text: str, model: str = "nomic-embed-text-v1.5") -> dict:
    """Get embeddings for text via the LM Studio embedding endpoint."""
    payload = {
        "model": model,
        "input": text,
    }
    return _http_post(f"{EMBED_BASE}/v1/embeddings", payload, timeout=30)


def embed_batch(texts: list[str], model: str = "nomic-embed-text-v1.5") -> dict:
    """Get embeddings for multiple texts in one call."""
    payload = {
        "model": model,
        "input": texts,
    }
    return _http_post(f"{EMBED_BASE}/v1/embeddings", payload, timeout=60)


# ── Pipeline status check ────────────────────────────────────────────────────

def pipeline_status() -> dict:
    """Check health of all pipelines. Returns dict of pipeline→status."""
    status = {}

    # ComfyUI
    try:
        r = comfyui_health()
        status["comfyui"] = "online" if "error" not in r else f"error: {r['error']}"
    except Exception as e:
        status["comfyui"] = f"offline: {e}"

    # TTS (all backends)
    status["tts_backends"] = tts_all_backends_status()

    # Embedding (uses LM Studio)
    try:
        r = _http_get(f"{EMBED_BASE}/v1/models", timeout=5)
        status["embedding"] = "online" if "error" not in r else f"error: {r['error']}"
    except Exception as e:
        status["embedding"] = f"offline: {e}"

    return status


# ── High-level dispatch ──────────────────────────────────────────────────────

def dispatch(prompt: str, **kwargs) -> dict:
    """Classify the prompt and dispatch to the appropriate pipeline.
    Returns: {"pipeline": ..., "result": ..., "prompt_id": ...}
    """
    pipe = classify_pipeline(prompt)

    if pipe == Pipeline.IMAGE:
        style = kwargs.get("style", "realistic")
        width = kwargs.get("width", 1024)
        height = kwargs.get("height", 1024)
        result = comfyui_generate_image(
            prompt, style=style, width=width, height=height)
        return {"pipeline": "image", **result}

    elif pipe == Pipeline.VIDEO:
        return {"pipeline": "video", "status": "pending",
                "message": "Video generation requires manual ComfyUI workflow. "
                           "Use Wan2.1 T2V or HunyuanVideo I2V workflow."}

    elif pipe == Pipeline.EDIT:
        return {"pipeline": "edit", "status": "pending",
                "message": "Image editing requires Lucy-Edit or Qwen-Image-Edit workflow."}

    elif pipe in (Pipeline.TTS, Pipeline.TTS_CLONE, Pipeline.TTS_BOOK):
        voice = kwargs.get("voice", "af_heart")
        backend = kwargs.get("backend") or tts_select_backend(prompt, pipe)
        # Ensure backend is a TTSBackend enum
        if isinstance(backend, str):
            try:
                backend = TTSBackend(backend)
            except ValueError:
                backend = TTSBackend.OUTETTS

        # Extract the text to speak
        text = re.sub(
            r"^(speak|say|read aloud|narrate|tts|clone voice|audiobook)\s*:?\s*",
            "", prompt, flags=re.I,
        )

        if pipe == Pipeline.TTS_CLONE:
            ref_audio = kwargs.get("reference_audio", "")
            if not ref_audio:
                return {"pipeline": "tts_clone", "error":
                        "reference_audio path required for voice cloning. "
                        "Supported backends: Chatterbox (5-sec), GPT-SoVITS (1-min), "
                        "AllTalk (XTTS), Fish Speech."}
            result = tts_clone_voice(text, ref_audio, backend=backend)
            return {"pipeline": "tts_clone", "backend": backend.value, **result}

        elif pipe == Pipeline.TTS_BOOK:
            result = tts_synthesize(text, voice=voice, backend=backend)
            return {"pipeline": "tts_audiobook", "backend": backend.value,
                    "note": "For full audiobook generation, use Chatterbox Audiobook "
                            "(G:\\Github\\Voice-Books\\TTS-Speech\\chatterbox-Audiobook-1) "
                            "or AllTalk Bulk TTS Generator.",
                    **result}

        else:  # Pipeline.TTS
            result = tts_synthesize(text, voice=voice, backend=backend)
            return {"pipeline": "tts", "backend": backend.value, **result}

    elif pipe == Pipeline.EMBED:
        result = embed_text(prompt)
        return {"pipeline": "embed", **result}

    elif pipe == Pipeline.UPSCALE:
        image_path = kwargs.get("image_path", "")
        if not image_path:
            return {"pipeline": "upscale", "error": "image_path required for upscaling"}
        result = comfyui_upscale(image_path)
        return {"pipeline": "upscale", **result}

    elif pipe == Pipeline.OCR:
        return {"pipeline": "ocr", "status": "pending",
                "message": "OCR requires VLM model (Nanonets-OCR2-3B or Qwen2-VL-OCR). "
                           "Load in LM Studio and use vision endpoint."}

    # Default: LLM
    return {"pipeline": "llm", "message": "Route to brain_llm.llm()"}
