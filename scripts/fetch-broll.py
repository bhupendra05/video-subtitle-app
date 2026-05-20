#!/usr/bin/env python3
"""
fetch-broll.py  —  Download AI-generated B-roll via SiliconFlow free API
                    (uses Wan2.2-I2V or CogVideoX model)

Usage:
    python3 scripts/fetch-broll.py --prompt "cinematic drone shot over crypto city, neon lights"
    python3 scripts/fetch-broll.py  # uses default crypto prompts

Free tier: ~100 API calls/month at siliconflow.cn
Sign up at: https://siliconflow.cn/  →  get API key  →  set SILICONFLOW_API_KEY env var

Output: public/broll/broll-<slug>.mp4
"""

import os
import sys
import time
import json
import hashlib
import argparse
import requests
from pathlib import Path

API_KEY    = os.environ.get("SILICONFLOW_API_KEY", "")
BASE_URL   = "https://api.siliconflow.cn/v1"
MODEL      = "Wan-AI/Wan2.2-I2V-01-480P"   # free-tier cinematic video model
OUT_DIR    = Path("public/broll")

# Default cinematic crypto prompts
DEFAULT_PROMPTS = [
    "cinematic drone shot over a futuristic city at night, neon Bitcoin and Ethereum logos on skyscrapers, rain-slicked streets reflecting golden light, teal-orange color grade, 4K",
    "extreme close-up of a gold Bitcoin spinning slowly on a dark glass surface, soft rim lighting, lens flare, cinematic depth of field, 4K",
    "abstract visualization of blockchain network, glowing nodes connecting across dark space, green and gold energy pulses, cinematic, 8K",
    "trading floor with multiple screens showing green crypto charts exploding upward, motion blur, dramatic lighting, teal shadows warm highlights",
    "aerial shot of Wall Street at dusk, giant holographic bull charging through buildings, golden light, cinematic color grade",
]

def generate_video(prompt: str, duration: int = 5) -> str | None:
    """Submit a video generation job and return download URL when ready."""
    if not API_KEY:
        print("⚠️  SILICONFLOW_API_KEY not set — set it and retry")
        print("    export SILICONFLOW_API_KEY=your_key_here")
        return None

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    # Submit job
    print(f"  📤 Submitting: {prompt[:60]}…")
    resp = requests.post(
        f"{BASE_URL}/video/submit",
        headers=headers,
        json={
            "model":  MODEL,
            "prompt": prompt,
            "negative_prompt": "blurry, low quality, distorted, watermark",
            "num_frames": duration * 24,
            "guidance_scale": 7.5,
            "seed": abs(hash(prompt)) % 99999,
        },
        timeout=30,
    )

    if resp.status_code != 200:
        print(f"  ❌ Submit failed: {resp.status_code} {resp.text[:200]}")
        return None

    job_id = resp.json().get("requestId") or resp.json().get("id")
    print(f"  ⏳ Job ID: {job_id} — polling…")

    # Poll for completion (max 5 minutes)
    for attempt in range(60):
        time.sleep(5)
        status_resp = requests.get(
            f"{BASE_URL}/video/status/{job_id}",
            headers=headers,
            timeout=15,
        )
        data = status_resp.json()
        status = data.get("status", "").lower()
        print(f"     [{attempt*5}s] status: {status}")

        if status in ("succeed", "completed", "done"):
            url = (data.get("videos") or [{}])[0].get("url") or data.get("url")
            if url:
                return url

        if status in ("failed", "error", "cancelled"):
            print(f"  ❌ Job failed: {data}")
            return None

    print("  ❌ Timed out after 5 minutes")
    return None


def download_video(url: str, slug: str) -> Path:
    """Download video from URL into public/broll/"""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"broll-{slug}.mp4"

    print(f"  ⬇️  Downloading → {out_path}")
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"  ✅ Saved: {out_path} ({size_mb:.1f} MB)")
    return out_path


def slugify(text: str) -> str:
    h = hashlib.md5(text.encode()).hexdigest()[:8]
    words = text[:30].lower().replace(" ", "-").replace(",", "")
    return f"{words}-{h}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", "-p", help="Video prompt (uses defaults if not set)")
    parser.add_argument("--all",    action="store_true", help="Generate all default prompts")
    args = parser.parse_args()

    prompts = DEFAULT_PROMPTS if args.all else [args.prompt or DEFAULT_PROMPTS[0]]

    print(f"\n🎬 SiliconFlow B-roll Generator")
    print(f"   Model: {MODEL}")
    print(f"   Output: {OUT_DIR}/\n")

    for i, prompt in enumerate(prompts):
        print(f"\n[{i+1}/{len(prompts)}] Generating B-roll…")
        url = generate_video(prompt)
        if url:
            slug = slugify(prompt)
            download_video(url, slug)
        else:
            print(f"  ⚠️  Skipping — no URL returned")

    print("\n🏁 Done. Add clips to your Remotion composition with:")
    print("   import { Video } from 'remotion';")
    print("   <Video src={staticFile('broll/broll-xxx.mp4')} />")


if __name__ == "__main__":
    main()
