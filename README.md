# 🎬 AI Shorts Studio v1

A full-stack AI pipeline that turns a single text prompt into a polished **YouTube Shorts / TikTok / Instagram Reels** video — completely free, runs locally.

## ✨ Features

- **Script generation** via Gemini AI (or Claude / Ollama)
- **Neural TTS** via Microsoft Edge-TTS (10+ free voices)
- **Word-level captions** via Whisper.cpp — perfectly synced
- **Cinematic images** via Pollinations.ai FLUX (free, no API key)
- **Ken Burns effect** — 6 animated camera movements on images
- **Remotion rendering** — programmatic 1080×1920 video composition
- **FFmpeg color grade** — cinematic LUT applied automatically
- **Web Studio UI** — type a topic, watch it render live with SSE progress

## 🚀 Quick Start

```bash
# Install dependencies
npm install
pip install edge-tts

# Add API key
echo "GEMINI_API_KEY=your_key_here" >> .env

# Create a video via CLI
node scripts/create-short.mjs --topic "How Bitcoin will hit $1M" --images

# OR start the Web Studio
node server.mjs
# → open http://localhost:3131/studio.html
```

## 🎛️ CLI Options

```
--topic      Topic for AI script generation
--voice      Edge-TTS voice (default: en-US-AriaNeural)
--color      teal-gold | cyber-green | fire-red | electric-blue
--images     Generate AI cinematic images (free via Pollinations)
--no-grade   Skip FFmpeg color grade
--dry-run    Print steps without executing
```

## 🎙️ Available Voices

| Voice | Style |
|-------|-------|
| en-US-AriaNeural | Female, warm (default) |
| en-US-GuyNeural | Male, deep |
| en-US-JennyNeural | Female, friendly |
| en-GB-SoniaNeural | British female |
| en-AU-NatashaNeural | Australian female |

## 🎨 Color Schemes

| Scheme | Use Case |
|--------|----------|
| `teal-gold` | Finance & Crypto |
| `cyber-green` | Tech & AI |
| `fire-red` | Health & Urgent |
| `electric-blue` | Space & Future |

## 📦 Pipeline Steps

```
1. Script   → Gemini AI generates narration + title + hashtags
2. TTS      → Edge-TTS synthesises neural voice audio
3. Whisper  → Word-level transcription for synced captions
4. Images   → Pollinations FLUX generates cinematic stills
5. Remotion → Renders 1080×1920 composition with animations
6. FFmpeg   → Applies cinematic color grade
```

## 🛠️ Requirements

- Node.js 18+
- Python 3.8+ with `edge-tts` (`pip install edge-tts`)
- FFmpeg in PATH
- Remotion (included via npm)
- Whisper.cpp (auto-downloaded by Remotion)

## 🔑 Environment Variables

```env
GEMINI_API_KEY=      # Free at aistudio.google.com
ANTHROPIC_API_KEY=   # Optional fallback for script gen
PORT=3131            # Web server port
```

## 📁 Project Structure

```
scripts/
  create-short.mjs    # Master pipeline orchestrator
  generate-script.mjs # AI script generation
  generate-images.mjs # Image generation (Pollinations)
  transcribe.ts       # Whisper word-level captions
  tts.py              # Edge-TTS voice synthesis
src/
  UniversalShort.tsx  # Remotion composition
  index.tsx           # Remotion root
web/
  studio.html         # Web Studio UI
server.mjs            # Express API server
```

---

> **v2** with real AI video clips (Wan2.1-I2V): [video-subtitle-app-v2](https://github.com/bhupendra05/video-subtitle-app-v2)
