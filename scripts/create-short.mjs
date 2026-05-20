#!/usr/bin/env node
/**
 * create-short.mjs — Master orchestrator for the AI Shorts pipeline
 *
 * Usage:
 *   node scripts/create-short.mjs --topic "AI is replacing jobs"
 *   node scripts/create-short.mjs --topic "..." --voice en-US-GuyNeural --color fire-red --broll
 *   node scripts/create-short.mjs --script path/to/script.json  # skip AI generation
 *
 * Pipeline steps:
 *   1. Generate script  (Ollama / Claude Haiku)
 *   2. Edge-TTS         (free Microsoft voices)
 *   3. Whisper.cpp      (word-level captions)
 *   4. [optional] Images via Pollinations.ai/Gemini  (--images flag, FREE)
 *   5. [optional] SiliconFlow B-roll  (--broll flag)
 *   6. Remotion render  (UniversalShort composition)
 *   7. FFmpeg grade     (cinematic color grade)
 *
 * Requirements (all free):
 *   pip install edge-tts
 *   npm install (project deps already include remotion)
 *   ffmpeg in PATH
 *   For B-roll: SILICONFLOW_API_KEY in .env
 *   For script gen: ollama (free) or ANTHROPIC_API_KEY
 */

import { promisify } from 'util';
import { exec }      from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path          from 'path';
import { fileURLToPath } from 'url';

// Load .env if present
try {
  const { config } = await import('dotenv');
  config();
} catch {}

const execAsync = promisify(exec);
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const PUBLIC     = path.join(ROOT, 'public');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] ?? def : def;
};
const hasFlag = (flag) => args.includes(flag);

const topic     = getArg('--topic');
const scriptIn  = getArg('--script');    // pre-written script JSON
const voice     = getArg('--voice', 'en-US-AriaNeural');
const colorArg  = getArg('--color');     // override colorScheme from script
const fetchBroll   = hasFlag('--broll');
const fetchImages  = hasFlag('--images');
const dryRun    = hasFlag('--dry-run');  // skip actual renders
const skipGrade = hasFlag('--no-grade');

if (!topic && !scriptIn) {
  console.error(`
Usage:
  node scripts/create-short.mjs --topic "Your topic"
  node scripts/create-short.mjs --topic "..." --voice en-US-GuyNeural --color fire-red --broll
  node scripts/create-short.mjs --script my-script.json

Flags:
  --topic      Topic for AI script generation
  --script     Path to pre-written script JSON (skips AI step)
  --voice      Edge-TTS voice (default: en-US-AriaNeural)
  --color      Color scheme: teal-gold | cyber-green | fire-red | electric-blue
  --images     Generate cinematic images (FREE via Pollinations.ai, or Gemini if GEMINI_API_KEY set)
  --broll      Fetch AI video B-roll from SiliconFlow (requires SILICONFLOW_API_KEY)
  --no-grade   Skip FFmpeg cinematic color grading
  --dry-run    Print steps without executing

Available free voices:
  en-US-AriaNeural      Female, warm  (default)
  en-US-GuyNeural       Male, deep
  en-US-JennyNeural     Female, friendly
  en-GB-SoniaNeural     British female
  en-AU-NatashaNeural   Australian female
`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const JOB_ID = Date.now().toString();
const step = (n, total, msg) => {
  console.log(`\n${'─'.repeat(52)}`);
  console.log(` Step ${n}/${total} — ${msg}`);
  console.log('─'.repeat(52));
};

async function run(cmd, opts = {}) {
  if (dryRun) { console.log(`  [dry-run] ${cmd}`); return { stdout: '', stderr: '' }; }
  console.log(`  $ ${cmd.slice(0, 100)}${cmd.length > 100 ? '…' : ''}`);
  return execAsync(cmd, { cwd: ROOT, timeout: 10 * 60 * 1000, ...opts });
}

function ensureDirs(...dirs) {
  for (const d of dirs) mkdirSync(d, { recursive: true });
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const AUDIO_DIR    = path.join(PUBLIC, 'audio');
const CAPTIONS_DIR = path.join(PUBLIC, 'captions');
const RENDERS_DIR  = path.join(PUBLIC, 'renders');
const BROLL_DIR    = path.join(PUBLIC, 'broll');

const TTS_MP3      = path.join(AUDIO_DIR,    `${JOB_ID}-tts.mp3`);
const TTS_WAV      = path.join(AUDIO_DIR,    `${JOB_ID}-tts.wav`);
const CAPTIONS_JSON= path.join(CAPTIONS_DIR, `${JOB_ID}.json`);
const SCRIPT_JSON  = path.join(ROOT, `public`, `${JOB_ID}-script.json`);
const NARR_TXT     = path.join(PUBLIC, 'audio', `${JOB_ID}-narration.txt`);
const RAW_MP4      = path.join(RENDERS_DIR,  `${JOB_ID}-raw.mp4`);

// Final output path (derived after script is loaded, slug from topic)
let FINAL_MP4 = path.join(RENDERS_DIR, `${JOB_ID}-FINAL.mp4`);

// ── Step 1: Script ────────────────────────────────────────────────────────────
async function stepScript() {
  step(1, 6, 'Generating script');

  let script;
  if (scriptIn) {
    script = JSON.parse(readFileSync(scriptIn, 'utf8'));
    console.log(`  📄 Using provided script: ${scriptIn}`);
  } else {
    console.log(`  Topic: "${topic}"`);
    const { stdout } = await run(
      `node scripts/generate-script.mjs --topic ${JSON.stringify(topic)}`,
      { timeout: 90_000 },
    );
    script = JSON.parse(stdout);
  }

  // CLI override for color scheme
  if (colorArg) script.colorScheme = colorArg;

  writeFileSync(SCRIPT_JSON, JSON.stringify(script, null, 2));
  console.log(`  ✅ Script ready (${script.narration.split(' ').length} words)`);
  return script;
}

// ── Step 2: TTS ───────────────────────────────────────────────────────────────
async function stepTTS(script) {
  step(2, 6, `Edge-TTS voiceover (${voice})`);

  ensureDirs(AUDIO_DIR);
  writeFileSync(NARR_TXT, script.narration, 'utf8');

  await run(`python3 scripts/tts.py "${NARR_TXT}" "${voice}" "${TTS_MP3}"`, {
    timeout: 3 * 60 * 1000,
  });

  if (!existsSync(TTS_MP3)) throw new Error(`TTS failed — ${TTS_MP3} not created`);

  // Get audio duration
  const { stdout } = await run(
    `npx remotion ffprobe -v quiet -print_format json -show_format "${TTS_MP3}"`,
  );
  const durationSec = parseFloat(JSON.parse(stdout).format?.duration ?? '30');
  console.log(`  ✅ Audio: ${durationSec.toFixed(1)}s → ${path.relative(ROOT, TTS_MP3)}`);
  return durationSec;
}

// ── Step 3: Transcribe (word-level captions) ──────────────────────────────────
async function stepTranscribe() {
  step(3, 6, 'Whisper word-level transcription');

  ensureDirs(CAPTIONS_DIR);

  // Convert MP3 → WAV for Whisper
  await run(`npx remotion ffmpeg -i "${TTS_MP3}" -ar 16000 -ac 1 "${TTS_WAV}" -y`);

  await run(`npx tsx scripts/transcribe.ts "${TTS_WAV}" "${CAPTIONS_JSON}"`, {
    timeout: 5 * 60 * 1000,
  });

  // Clean up WAV
  await run(`rm -f "${TTS_WAV}"`);

  if (!existsSync(CAPTIONS_JSON)) throw new Error('Transcription failed — no captions JSON');

  const caps = JSON.parse(readFileSync(CAPTIONS_JSON, 'utf8'));
  console.log(`  ✅ Captions: ${caps.length} word tokens`);
}

// ── Step 4: Images (optional) ────────────────────────────────────────────────
async function stepImages(script) {
  step(4, 7, 'Generating cinematic images (Pollinations.ai FLUX)');

  if (!fetchImages) {
    console.log('  ⏭  Skipped (pass --images to enable)');
    return [];
  }

  const imgOutDir  = `images/${JOB_ID}`;
  const imgOutFull = path.join(PUBLIC, imgOutDir);

  const scriptPath = SCRIPT_JSON;
  const { stdout } = await run(
    `node scripts/generate-images.mjs --script "${scriptPath}" --out "${imgOutFull}" --count 6`,
    { timeout: 12 * 60 * 1000 },
  );

  let slides = [];
  try {
    // stdout ends with JSON array from generate-images.mjs
    const jsonStart = stdout.lastIndexOf('[');
    slides = jsonStart !== -1 ? JSON.parse(stdout.slice(jsonStart)) : [];
  } catch {
    console.log('  ⚠️  Could not parse image paths from output');
  }

  console.log(`  ✅ Images: ${slides.length} slides ready`);
  return slides;
}

// ── Step 5: B-roll (optional) ─────────────────────────────────────────────────
async function stepBroll(script) {
  step(5, 7, 'Fetching AI B-roll (SiliconFlow)');

  if (!fetchBroll) {
    console.log('  ⏭  Skipped (pass --broll to enable)');
    return [];
  }

  if (!process.env.SILICONFLOW_API_KEY) {
    console.log('  ⚠️  SILICONFLOW_API_KEY not set — skipping B-roll');
    console.log('     Get a free key at: https://siliconflow.cn/');
    return [];
  }

  ensureDirs(BROLL_DIR);

  // Generate 2 clips from the topic
  const prompt1 = `cinematic ${script.topic}, dramatic lighting, 4K, ultra realistic`;
  const prompt2 = `close-up cinematic shot about ${script.topic}, shallow depth of field, film grain`;

  for (const prompt of [prompt1, prompt2]) {
    await run(
      `python3 scripts/fetch-broll.py --prompt ${JSON.stringify(prompt)}`,
      { timeout: 8 * 60 * 1000 },
    );
  }

  // Collect generated clips
  const { stdout } = await run(`ls "${BROLL_DIR}"/broll-*.mp4 2>/dev/null || true`);
  const clips = stdout.trim().split('\n').filter(Boolean)
    .map(p => path.relative(PUBLIC, p).replace(/\\/g, '/'));

  console.log(`  ✅ B-roll: ${clips.length} clips`);
  return clips;
}

// ── Step 5: Remotion render ───────────────────────────────────────────────────
async function stepRender(script, durationSec, imageSlides, brollClips) {
  step(6, 7, 'Remotion render');

  ensureDirs(RENDERS_DIR);

  const FPS             = 30;
  const durationInFrames = Math.ceil(durationSec * FPS) + 30; // +1s buffer

  // Paths relative to public/ for Remotion staticFile()
  const audioFile    = path.relative(PUBLIC, TTS_MP3).replace(/\\/g, '/');
  const captionsFile = path.relative(PUBLIC, CAPTIONS_JSON).replace(/\\/g, '/');

  const props = {
    topic:          script.topic,
    audioFile,
    captionsFile,
    brollClips,
    imageSlides,
    colorScheme:    script.colorScheme,
    titleCard:      script.titleCard,
    cta:            script.cta,
    hashtags:       script.hashtags,
    stats:          script.stats ?? [],
    durationInFrames,
    fps:            FPS,
  };

  const propsPath = path.join(PUBLIC, `${JOB_ID}-props.json`);
  writeFileSync(propsPath, JSON.stringify(props));

  const slug = script.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  FINAL_MP4  = path.join(RENDERS_DIR, `${slug}-FINAL.mp4`);

  await run(
    `npx remotion render UniversalShort "${RAW_MP4}" ` +
    `--props="${propsPath}" ` +
    `--codec=h264 --crf=16 --concurrency=4`,
    { timeout: 10 * 60 * 1000 },
  );

  if (!dryRun && !existsSync(RAW_MP4)) throw new Error('Render failed — no output file');
  console.log(`  ✅ Raw render → ${path.relative(ROOT, RAW_MP4)}`);
}

// ── Step 6: Cinematic grade ───────────────────────────────────────────────────
async function stepGrade() {
  step(7, 7, 'FFmpeg cinematic color grade');

  if (skipGrade) {
    FINAL_MP4 = RAW_MP4;
    console.log('  ⏭  Skipped (--no-grade)');
    return;
  }

  await run(`bash scripts/cinematic-grade.sh "${RAW_MP4}" "${FINAL_MP4}"`, {
    timeout: 5 * 60 * 1000,
  });

  // Remove raw render to save space
  if (!dryRun) await run(`rm -f "${RAW_MP4}"`);

  if (!dryRun && !existsSync(FINAL_MP4)) throw new Error('Grade failed — no output file');
  console.log(`  ✅ Graded → ${path.relative(ROOT, FINAL_MP4)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       🎬  AI SHORTS PIPELINE  🎬                 ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Job ID:   ${JOB_ID}`);
  console.log(`  Voice:    ${voice}`);
  if (topic) console.log(`  Topic:    ${topic}`);

  try {
    ensureDirs(AUDIO_DIR, CAPTIONS_DIR, RENDERS_DIR);

    const script      = await stepScript();
    const durationSec = await stepTTS(script);
    await stepTranscribe();
    const imageSlides = await stepImages(script);
    const brollClips  = await stepBroll(script);
    await stepRender(script, durationSec, imageSlides, brollClips);
    await stepGrade();

    // ── Done ─────────────────────────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    let sizeStr = '';
    if (!dryRun && existsSync(FINAL_MP4)) {
      const { stdout } = await execAsync(`du -sh "${FINAL_MP4}"`);
      sizeStr = stdout.split('\t')[0];
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  ✅  SHORT CREATED SUCCESSFULLY                  ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`\n  📹 Output:   ${path.relative(ROOT, FINAL_MP4)}`);
    if (sizeStr) console.log(`  📦 Size:     ${sizeStr}`);
    console.log(`  ⏱  Time:     ${elapsed}s`);
    console.log(`\n  Script:     ${path.relative(ROOT, SCRIPT_JSON)}`);
    console.log(`  Captions:   ${path.relative(ROOT, CAPTIONS_JSON)}`);
    console.log('\n  Ready to upload to YouTube Shorts / TikTok / Instagram Reels!');
    console.log();

  } catch (err) {
    console.error(`\n\n❌ Pipeline failed at step:\n   ${err.message}`);
    if (err.stderr) console.error(`\n   stderr: ${err.stderr.slice(0, 400)}`);
    process.exit(1);
  }
}

main();
