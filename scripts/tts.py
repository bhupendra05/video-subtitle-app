"""
Edge TTS script — free Microsoft neural voices, no API key needed.
Usage: python3 scripts/tts.py <text_file> <voice> <output.mp3>
"""
import asyncio
import sys
import edge_tts

async def main():
    text_file = sys.argv[1]
    voice     = sys.argv[2]
    output    = sys.argv[3]

    with open(text_file, 'r', encoding='utf-8') as f:
        text = f.read().strip()

    if not text:
        print("Error: transcript is empty", file=sys.stderr)
        sys.exit(1)

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output)
    print(f"[tts] Saved → {output}")

asyncio.run(main())
