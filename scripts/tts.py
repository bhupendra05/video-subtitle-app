#!/usr/bin/env python3
"""
tts.py — Emotional text-to-speech synthesis

Priority:
  1. ElevenLabs  (highly emotional, natural cadence) — if ELEVENLABS_API_KEY set
  2. Edge-TTS    (free Microsoft voices)              — fallback

Usage: python3 scripts/tts.py <text_file> <voice_name> <output.mp3>
"""
import asyncio, sys, os, re, json, urllib.request, urllib.error

if len(sys.argv) < 4:
    print("Usage: tts.py <text_file> <voice_name> <output.mp3>", file=sys.stderr)
    sys.exit(1)

text_file  = sys.argv[1]
voice_name = sys.argv[2]
out_mp3    = sys.argv[3]

with open(text_file, 'r', encoding='utf-8') as f:
    raw = f.read()

# ── Pre-process: remove gaps so narration flows fast, no dead air ─────────────
text = raw
text = re.sub(r'\r\n|\r', '\n', text)      # normalize line endings
text = re.sub(r'\n{2,}', ' ', text)        # paragraph breaks → single space
text = re.sub(r'\n', ' ', text)             # remaining newlines → space
text = re.sub(r'\.{3,}', '.', text)        # ellipsis → period (no pause)
text = re.sub(r'\.\s{2,}', '. ', text)     # excessive post-period space
text = re.sub(r',\s{2,}', ', ', text)      # excessive post-comma space
text = re.sub(r'\s{2,}', ' ', text)        # collapse all whitespace
text = text.strip()

if not text:
    print("Error: narration is empty", file=sys.stderr)
    sys.exit(1)

ELEVENLABS_KEY = os.environ.get('ELEVENLABS_API_KEY', '').strip()
ELEVENLABS_VID = os.environ.get('ELEVENLABS_VOICE_ID', 'pNInz6obpgDQGcFmaJgB').strip()

# ── ElevenLabs (primary — highly emotional) ───────────────────────────────────
def tts_elevenlabs():
    print(f"  ElevenLabs TTS (voice: {ELEVENLABS_VID}) …", file=sys.stderr)
    url     = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VID}/stream"
    payload = json.dumps({
        "text":     text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability":        0.22,   # low = very expressive/emotional
            "similarity_boost": 0.80,
            "style":            0.60,   # style exaggeration
            "use_speaker_boost": True,
        },
        "output_format": "mp3_44100_128",
    }).encode('utf-8')

    req = urllib.request.Request(
        url, data=payload,
        headers={
            'xi-api-key':   ELEVENLABS_KEY,
            'Content-Type': 'application/json',
            'Accept':       'audio/mpeg',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            audio = resp.read()
        if len(audio) < 1000:
            raise RuntimeError(f"Response too small ({len(audio)} bytes)")
        with open(out_mp3, 'wb') as f:
            f.write(audio)
        print(f"  ElevenLabs saved → {os.path.basename(out_mp3)} ({len(audio)//1024} KB)", file=sys.stderr)
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f"  ElevenLabs HTTP {e.code}: {body[:300]}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  ElevenLabs error: {e}", file=sys.stderr)
        return False

# ── Edge-TTS (fallback — free) ────────────────────────────────────────────────
def tts_edge():
    print(f"  Edge-TTS ({voice_name}) …", file=sys.stderr)
    import edge_tts

    async def _run():
        communicate = edge_tts.Communicate(text, voice_name)
        await communicate.save(out_mp3)

    asyncio.run(_run())
    print(f"  Edge-TTS saved → {os.path.basename(out_mp3)}", file=sys.stderr)

# ── Run ───────────────────────────────────────────────────────────────────────
if ELEVENLABS_KEY:
    ok = tts_elevenlabs()
    if not ok:
        print("  Falling back to Edge-TTS …", file=sys.stderr)
        tts_edge()
else:
    print("  (No ELEVENLABS_API_KEY — using Edge-TTS)", file=sys.stderr)
    tts_edge()
