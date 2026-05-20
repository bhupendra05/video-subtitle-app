#!/usr/bin/env node
/**
 * generate-images.mjs — Cinematic image generator for AI Shorts
 *
 * Backends (auto-selected by priority):
 *   1. Gemini Imagen 3  — best quality, needs GEMINI_API_KEY in .env
 *   2. Pollinations.ai  — completely FREE, no API key, uses FLUX model
 *
 * Usage:
 *   node scripts/generate-images.mjs --topic "How to get rich" --count 4 --out public/images/job123
 *   node scripts/generate-images.mjs --script public/1234-script.json --out public/images/job123
 *
 * Output:
 *   public/images/<out>/image-0.jpg
 *   public/images/<out>/image-1.jpg
 *   ...
 *   Prints JSON array of relative paths (from public/) to stdout.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

try { const { config } = await import('dotenv'); config(); } catch {}

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const PUBLIC     = path.join(ROOT, 'public');

const GEMINI_KEY  = process.env.GEMINI_API_KEY || '';
const GEMINI_URL  = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_KEY}`;

// ── CLI args ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] ?? def : def; };

const topicArg  = getArg('--topic');
const scriptArg = getArg('--script');
const outDir    = getArg('--out', `images/${Date.now()}`);
const count     = parseInt(getArg('--count', '4'), 10);

if (!topicArg && !scriptArg) {
  console.error('Usage: node scripts/generate-images.mjs --topic "..." --out public/images/job');
  process.exit(1);
}

// ── Load topic from script file or arg ───────────────────────────────────────
let topic = topicArg;
let colorScheme = 'cinematic dark';

if (scriptArg) {
  try {
    const { readFileSync } = await import('fs');
    const script = JSON.parse(readFileSync(scriptArg, 'utf8'));
    topic = script.topic || topicArg;
    colorScheme = script.colorScheme || colorScheme;
  } catch (e) {
    console.error(`Could not read script file: ${e.message}`);
    process.exit(1);
  }
}

// ── Build image prompts — high-impact, cinematic, photorealistic ──────────────
function buildPrompts(topic, count) {
  const styles = [
    // Hero shot — full bleed, maximum impact
    `cinematic hero shot, ${topic}, dramatic backlighting, volumetric light rays, ultra-sharp focus, 4K HDR photorealistic, professional commercial photography, vertical 9:16 portrait format, stunning composition`,
    // Close-up — texture and detail
    `extreme macro close-up, ${topic}, razor-sharp detail, beautiful creamy bokeh background, dramatic side-lighting, professional studio, 4K photorealistic, dark rich background, vertical portrait 9:16`,
    // Dynamic — motion and energy
    `dynamic cinematic action, ${topic}, motion blur accents, cinematic rim lighting, epic scale, lens flare, natural color grading, 4K ultra realistic, vertical portrait format`,
    // Aerial / wide — scale and drama
    `dramatic aerial perspective, ${topic}, golden hour warm light, long shadows, breathtaking scale, architectural beauty, 4K photorealistic, vertical 9:16, epic wide angle`,
    // Dark artistic — moody atmosphere
    `cinematic dark portrait, ${topic}, chiaroscuro lighting, single dramatic light source, deep shadows, fine art photography aesthetic, 4K vertical 9:16, ultra detailed`,
    // Abstract energy — concept visualization
    `abstract cinematic concept, ${topic}, glowing light trails, particle effects, dark background, ultra-high-definition digital art, photorealistic rendering, vertical 9:16, vivid yet natural colors`,
    // Environmental — real world context
    `immersive environmental photography, ${topic}, natural ambient light, documentary style, 4K sharp, wide environmental context, vertical 9:16 portrait`,
    // Minimalist — clean and powerful
    `minimalist high-impact photography, ${topic}, clean composition, bold contrast, single light source, high-fashion editorial style, 4K photorealistic, vertical portrait 9:16`,
  ];
  return styles.slice(0, Math.min(count, styles.length));
}

// ── Pollinations.ai backend (FREE, no key) ────────────────────────────────────
async function generateWithPollinations(prompt, outputPath) {
  const encoded = encodeURIComponent(prompt);
  // Use FLUX model for highest quality
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1920&model=flux&nologo=true&enhance=true&seed=${Math.floor(Math.random() * 99999)}`;

  console.log(`  🌸 Pollinations (FLUX): ${prompt.slice(0, 60)}…`);

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength < 1000) throw new Error('Pollinations returned empty/tiny image');

  writeFileSync(outputPath, Buffer.from(buffer));
  const kb = (buffer.byteLength / 1024).toFixed(0);
  console.log(`  ✅ Saved ${kb}KB → ${path.basename(outputPath)}`);
}

// ── Gemini Imagen 3 backend ───────────────────────────────────────────────────
async function generateWithGemini(prompt, outputPath) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');

  console.log(`  🔵 Gemini Imagen 3: ${prompt.slice(0, 60)}…`);

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '9:16',
        safetyFilterLevel: 'block_some',
        personGeneration: 'allow_adult',
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const b64  = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error(`Gemini: no image in response — ${JSON.stringify(data).slice(0, 200)}`);

  writeFileSync(outputPath, Buffer.from(b64, 'base64'));
  const kb = (Buffer.from(b64, 'base64').byteLength / 1024).toFixed(0);
  console.log(`  ✅ Saved ${kb}KB → ${path.basename(outputPath)}`);
}

// ── Generate one image with fallback chain ────────────────────────────────────
async function generateImage(prompt, outputPath, index) {
  // Try Gemini first (better quality), fall back to Pollinations
  if (GEMINI_KEY) {
    try {
      await generateWithGemini(prompt, outputPath);
      return;
    } catch (e) {
      console.log(`  ⚠️  Gemini failed: ${e.message} — falling back to Pollinations`);
    }
  }
  await generateWithPollinations(prompt, outputPath);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const fullOutDir = path.isAbsolute(outDir) ? outDir : path.join(PUBLIC, outDir);
  mkdirSync(fullOutDir, { recursive: true });

  const prompts = buildPrompts(topic, count);
  const backend = GEMINI_KEY ? 'Gemini Imagen 3 → Pollinations fallback' : 'Pollinations.ai FLUX (free)';

  console.log(`\n🎨 Image Generator`);
  console.log(`   Topic:   ${topic}`);
  console.log(`   Count:   ${count} images`);
  console.log(`   Backend: ${backend}`);
  console.log(`   Output:  ${path.relative(ROOT, fullOutDir)}/\n`);

  const outputPaths = [];

  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n[${i + 1}/${prompts.length}]`);
    const outPath = path.join(fullOutDir, `image-${i}.jpg`);

    // Skip if already exists (re-run friendly)
    if (existsSync(outPath)) {
      console.log(`  ⏭  Already exists: ${path.basename(outPath)}`);
      outputPaths.push(path.relative(PUBLIC, outPath));
      continue;
    }

    try {
      await generateImage(prompts[i], outPath, i);
      outputPaths.push(path.relative(PUBLIC, outPath));
    } catch (e) {
      console.error(`  ❌ Failed: ${e.message}`);
      // Continue with remaining images — partial results are fine
    }

    // Small delay between requests to be polite
    if (i < prompts.length - 1) await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\n✅ Generated ${outputPaths.length}/${count} images`);

  // Print paths as JSON for orchestrator to consume
  process.stdout.write(JSON.stringify(outputPaths));
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
