#!/bin/bash
# One-command render + cinematic grade pipeline
# Usage: bash scripts/render-and-grade.sh

set -e
cd "$(dirname "$0")/.."

RAW="public/renders/crypto-bullrun-2026-raw.mp4"
FINAL="public/renders/crypto-bullrun-2026-FINAL.mp4"

echo "═══════════════════════════════════════════════════"
echo " 🎬 CRYPTO BULL RUN 2026 — Full Render Pipeline"
echo "═══════════════════════════════════════════════════"
echo ""

# Step 1 — Remotion render
echo "Step 1/2 — Rendering with Remotion..."
npx remotion render CryptoBullRun2026 "$RAW" \
  --codec=h264 \
  --crf=14 \
  --concurrency=4

echo ""
echo "Step 2/2 — Applying cinematic color grade..."
bash scripts/cinematic-grade.sh "$RAW" "$FINAL"

echo ""
echo "═══════════════════════════════════════════════════"
echo " ✅ DONE → $FINAL"
echo " $(du -sh "$FINAL" | cut -f1) | $(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$FINAL" | xargs printf '%.1f sec')"
echo "═══════════════════════════════════════════════════"
