/**
 * Direct CLI pipeline — no web server needed.
 * Usage: node scripts/run-pipeline.mjs [voice]
 * Default voice: en-US-AriaNeural
 */
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const VIDEO_PATH = path.join(PUBLIC_DIR, 'uploads', 'input.mp4');
const VOICE      = process.argv[2] || 'en-US-AriaNeural';
const JOB_ID     = Date.now().toString();

for (const d of ['audio', 'captions', 'renders']) {
  fs.mkdirSync(path.join(PUBLIC_DIR, d), { recursive: true });
}

const step = (n, total, msg) => console.log(`\n[${n}/${total}] ${msg}`);

async function run() {
  const audioWav   = path.join(PUBLIC_DIR, 'audio',    `${JOB_ID}.wav`);
  const origCaps   = path.join(PUBLIC_DIR, 'captions', `${JOB_ID}-orig.json`);
  const txFile     = path.join(PUBLIC_DIR, 'audio',    `${JOB_ID}-transcript.txt`);
  const ttsAudio   = path.join(PUBLIC_DIR, 'audio',    `${JOB_ID}-tts.mp3`);
  const ttsWav     = path.join(PUBLIC_DIR, 'audio',    `${JOB_ID}-tts.wav`);
  const finalCaps  = path.join(PUBLIC_DIR, 'captions', `${JOB_ID}-final.json`);
  const propsFile  = path.join(PUBLIC_DIR, `${JOB_ID}-props.json`);
  const outputPath = path.join(PUBLIC_DIR, 'renders',  `output-${JOB_ID}.mp4`);

  // 1 — Extract audio
  step(1, 5, 'Extracting audio…');
  await execAsync(`npx remotion ffmpeg -i "${VIDEO_PATH}" -ar 16000 -ac 1 "${audioWav}" -y`, { cwd: ROOT });

  // 2 — Video metadata
  step(2, 5, 'Reading video metadata…');
  const { stdout: probeRaw } = await execAsync(
    `npx remotion ffprobe -v quiet -print_format json -show_streams -show_format "${VIDEO_PATH}"`,
    { cwd: ROOT }
  );
  const probe = JSON.parse(probeRaw);
  const vs = probe.streams.find(s => s.codec_type === 'video') ?? probe.streams[0];
  const [fpsNum, fpsDen] = vs.r_frame_rate.split('/').map(Number);
  const fps    = Math.round(fpsNum / fpsDen) || 30;
  const width  = parseInt(vs.width,  10);
  const height = parseInt(vs.height, 10);
  const videoDurationSec = parseFloat(probe.format?.duration ?? vs.duration ?? '60');
  console.log(`   ${width}x${height} @ ${fps}fps — ${videoDurationSec.toFixed(1)}s`);

  // 3 — Transcribe with Whisper
  step(3, 5, 'Transcribing with Whisper (may take 1-2 min on first run)…');
  await execAsync(`npx tsx scripts/transcribe.ts "${audioWav}" "${origCaps}"`, { cwd: ROOT, timeout: 10 * 60 * 1000 });
  const origCaptions = JSON.parse(fs.readFileSync(origCaps, 'utf8'));
  const transcript = origCaptions.map(c => c.text).join('').trim();
  console.log(`   Transcript: ${transcript.slice(0, 80)}…`);

  // 4 — Edge TTS
  step(4, 5, `Generating voice with Edge TTS (${VOICE})…`);
  fs.writeFileSync(txFile, transcript, 'utf8');
  await execAsync(`python3 scripts/tts.py "${txFile}" "${VOICE}" "${ttsAudio}"`, { cwd: ROOT, timeout: 5 * 60 * 1000 });

  // Re-transcribe TTS audio for accurate subtitle timing
  await execAsync(`npx remotion ffmpeg -i "${ttsAudio}" -ar 16000 -ac 1 "${ttsWav}" -y`, { cwd: ROOT });
  await execAsync(`npx tsx scripts/transcribe.ts "${ttsWav}" "${finalCaps}"`, { cwd: ROOT, timeout: 10 * 60 * 1000 });

  for (const f of [txFile, ttsWav]) fs.rmSync(f, { force: true });

  // Get TTS duration
  const { stdout: ttsProbeRaw } = await execAsync(
    `npx remotion ffprobe -v quiet -print_format json -show_format "${ttsAudio}"`, { cwd: ROOT }
  );
  const ttsDurationSec  = parseFloat(JSON.parse(ttsProbeRaw).format?.duration ?? '60');
  const durationInFrames = Math.ceil(Math.max(videoDurationSec, ttsDurationSec) * fps);

  // Cap at 1080p
  const scale   = Math.min(1, 1920 / width);
  const rWidth  = Math.round(width  * scale / 2) * 2;
  const rHeight = Math.round(height * scale / 2) * 2;

  // 5 — Remotion render
  step(5, 5, 'Rendering final video (this takes a while)…');
  const props = { videoFile: 'uploads/input.mp4', audioFile: `audio/${JOB_ID}-tts.mp3`, captionsFile: `captions/${JOB_ID}-final.json`, durationInFrames, width: rWidth, height: rHeight, fps };
  fs.writeFileSync(propsFile, JSON.stringify(props));

  await execAsync(
    `npx remotion render src/index.tsx VideoWithSubtitles "${outputPath}" --props="${propsFile}" --log=error`,
    { cwd: ROOT, timeout: 60 * 60 * 1000 }
  );

  fs.rmSync(propsFile, { force: true });
  console.log(`\n✅ Done! Output saved to:\n   ${outputPath}\n`);
}

run().catch(err => { console.error('\n❌ Error:', err.message); process.exit(1); });
