#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# cinematic-grade.sh
# Apply FFmpeg cinematic post-processing to a rendered Remotion video
#
# Usage:
#   bash scripts/cinematic-grade.sh input.mp4 output.mp4
#
# What it does:
#   1. Teal-orange color grade (shadows → teal, highlights → warm)
#   2. Contrast + saturation boost (cinematic punch)
#   3. Film grain (finely textured noise)
#   4. Vignette (dark edge falloff)
#   5. Sharpening (unsharp mask)
#   6. Slight chromatic aberration (fringe via lens correction)
# ═══════════════════════════════════════════════════════════════════

INPUT="${1:-public/renders/crypto-bullrun-2026.mp4}"
OUTPUT="${2:-public/renders/crypto-bullrun-2026-GRADED.mp4}"

if [ ! -f "$INPUT" ]; then
  echo "Input file not found: $INPUT"
  exit 1
fi

echo "🎬 Applying cinematic grade to: $INPUT"
echo "   Output: $OUTPUT"

ffmpeg -y -i "$INPUT" \
  -vf "
    \
    eq=contrast=1.12:saturation=1.18:brightness=-0.02:gamma=0.95,\
    \
    curves=\
      red='0/0 0.2/0.15 0.5/0.52 0.8/0.85 1/1':\
      green='0/0 0.2/0.17 0.5/0.5 0.8/0.82 1/1':\
      blue='0/0.05 0.2/0.22 0.5/0.48 0.8/0.75 1/0.92',\
    \
    noise=alls=8:allf=t+u,\
    \
    vignette=PI/4,\
    \
    unsharp=lx=3:ly=3:la=0.4:cx=3:cy=3:ca=0.0\
  " \
  -c:v libx264 -preset slow -crf 16 \
  -c:a copy \
  "$OUTPUT"

echo ""
echo "✅ Grade complete → $OUTPUT"
echo "   $(du -sh "$OUTPUT" | cut -f1) file size"
