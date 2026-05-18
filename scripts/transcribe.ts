import path from 'path';
import fs from 'fs';
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from '@remotion/install-whisper-cpp';

const inputPath  = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: npx tsx scripts/transcribe.ts <input.wav> <output.json>');
  process.exit(1);
}

const whisperDir = path.join(process.cwd(), 'whisper.cpp');
const MODEL      = 'medium.en';
const VERSION    = '1.5.5';

console.log('[transcribe] Installing/checking Whisper.cpp…');
await installWhisperCpp({ to: whisperDir, version: VERSION });

console.log('[transcribe] Downloading model (cached after first run)…');
await downloadWhisperModel({ model: MODEL, folder: whisperDir });

console.log('[transcribe] Transcribing:', path.basename(inputPath));
const result = await transcribe({
  model:              MODEL,
  whisperPath:        whisperDir,
  whisperCppVersion:  VERSION,
  inputPath,
  tokenLevelTimestamps: true,
});

const { captions } = toCaptions({ whisperCppOutput: result });
fs.writeFileSync(outputPath, JSON.stringify(captions, null, 2));
console.log('[transcribe] Saved', captions.length, 'captions →', path.basename(outputPath));
