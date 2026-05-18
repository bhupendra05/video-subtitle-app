import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

for (const dir of ['uploads', 'audio', 'captions', 'renders']) {
  fs.mkdirSync(path.join(PUBLIC_DIR, dir), { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/public', express.static(PUBLIC_DIR));
app.use('/', express.static(path.join(__dirname, 'web')));

const jobs = new Map();

const storage = multer.diskStorage({
  destination: path.join(PUBLIC_DIR, 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

// ── Curated Edge TTS voice list ──────────────────────────────────────────────
const EDGE_VOICES = [
  { name: 'en-US-AriaNeural',    label: 'Aria',    locale: '🇺🇸 US',  gender: 'Female', style: 'Natural, warm'       },
  { name: 'en-US-JennyNeural',   label: 'Jenny',   locale: '🇺🇸 US',  gender: 'Female', style: 'Friendly, clear'     },
  { name: 'en-US-GuyNeural',     label: 'Guy',     locale: '🇺🇸 US',  gender: 'Male',   style: 'Confident, deep'     },
  { name: 'en-US-EricNeural',    label: 'Eric',    locale: '🇺🇸 US',  gender: 'Male',   style: 'Calm, professional'  },
  { name: 'en-US-MichelleNeural',label: 'Michelle',locale: '🇺🇸 US',  gender: 'Female', style: 'Bright, energetic'   },
  { name: 'en-US-RogerNeural',   label: 'Roger',   locale: '🇺🇸 US',  gender: 'Male',   style: 'Smooth, podcast'     },
  { name: 'en-GB-SoniaNeural',   label: 'Sonia',   locale: '🇬🇧 UK',  gender: 'Female', style: 'British, polished'   },
  { name: 'en-GB-RyanNeural',    label: 'Ryan',    locale: '🇬🇧 UK',  gender: 'Male',   style: 'British, crisp'      },
  { name: 'en-AU-NatashaNeural', label: 'Natasha', locale: '🇦🇺 AU',  gender: 'Female', style: 'Australian, clear'   },
  { name: 'en-AU-WilliamNeural', label: 'William', locale: '🇦🇺 AU',  gender: 'Male',   style: 'Australian, relaxed' },
  { name: 'en-IN-NeerjaNeural',  label: 'Neerja',  locale: '🇮🇳 IN',  gender: 'Female', style: 'Indian English'      },
];

app.get('/api/voices', (_req, res) => res.json(EDGE_VOICES));

// ── Preview a voice via Edge TTS ─────────────────────────────────────────────
app.get('/api/preview-voice/:name', async (req, res) => {
  const voice = req.params.name.replace(/[^a-zA-Z0-9-]/g, '');
  const mp3   = path.join(PUBLIC_DIR, 'audio', `preview-${voice}.mp3`);
  const info  = EDGE_VOICES.find((v) => v.name === voice);
  const label = info?.label ?? voice;

  try {
    await execAsync(
      `python3 -m edge_tts --voice "${voice}" --text "Hi, I am ${label}. This is how I sound when narrating your video." --write-media "${mp3}"`,
      { timeout: 15000 }
    );
    res.setHeader('Content-Type', 'audio/mpeg');
    const stream = fs.createReadStream(mp3);
    stream.pipe(res);
    stream.on('close', () => fs.rmSync(mp3, { force: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Upload ───────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const jobId = Date.now().toString();
  const voice = req.body.voice || 'en-US-AriaNeural';
  jobs.set(jobId, { status: 'uploaded', videoFilename: req.file.filename, voice });
  res.json({ jobId });
});

// ── Process (SSE) ────────────────────────────────────────────────────────────
app.get('/api/process/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const videoPath  = path.join(PUBLIC_DIR, 'uploads',  job.videoFilename);
    const audioWav   = path.join(PUBLIC_DIR, 'audio',    `${jobId}.wav`);
    const origCaps   = path.join(PUBLIC_DIR, 'captions', `${jobId}-orig.json`);
    const txFile     = path.join(PUBLIC_DIR, 'audio',    `${jobId}-transcript.txt`);
    const sayWav     = path.join(PUBLIC_DIR, 'audio',    `${jobId}-say.wav`);
    const ttsAudio   = path.join(PUBLIC_DIR, 'audio',    `${jobId}-tts.mp3`);
    const ttsWav     = path.join(PUBLIC_DIR, 'audio',    `${jobId}-tts.wav`);
    const finalCaps  = path.join(PUBLIC_DIR, 'captions', `${jobId}-final.json`);
    const propsFile  = path.join(PUBLIC_DIR, `${jobId}-props.json`);
    const outputPath = path.join(PUBLIC_DIR, 'renders',  `${jobId}.mp4`);

    // 1 ── Extract 16kHz mono WAV for Whisper
    send({ step: 1, total: 5, label: 'Extracting audio from video…' });
    await execAsync(
      `npx remotion ffmpeg -i "${videoPath}" -ar 16000 -ac 1 "${audioWav}" -y`,
      { cwd: __dirname }
    );

    // 2 ── Video metadata
    send({ step: 2, total: 5, label: 'Reading video metadata…' });
    const { stdout: probeRaw } = await execAsync(
      `npx remotion ffprobe -v quiet -print_format json -show_streams -show_format "${videoPath}"`,
      { cwd: __dirname }
    );
    const probe = JSON.parse(probeRaw);
    const vs = probe.streams.find((s) => s.codec_type === 'video') ?? probe.streams[0];
    const [fpsNum, fpsDen] = vs.r_frame_rate.split('/').map(Number);
    const fps    = Math.round(fpsNum / fpsDen) || 30;
    const width  = parseInt(vs.width,  10);
    const height = parseInt(vs.height, 10);
    const videoDurationSec = parseFloat(probe.format?.duration ?? vs.duration ?? '60');

    // 3 ── Transcribe with Whisper
    send({ step: 3, total: 5, label: 'Transcribing with Whisper (1-2 min on first run)…' });
    await execAsync(
      `npx tsx scripts/transcribe.ts "${audioWav}" "${origCaps}"`,
      { cwd: __dirname, timeout: 10 * 60 * 1000 }
    );
    const origCaptions = JSON.parse(fs.readFileSync(origCaps, 'utf8'));
    const transcript = origCaptions.map((c) => c.text).join('').trim();
    if (!transcript) throw new Error('Whisper produced an empty transcript — check the video has clear speech.');

    // 4 ── Edge TTS (Microsoft neural voices, free, no API key)
    send({ step: 4, total: 5, label: `Generating voice with Edge TTS (${job.voice})…` });

    fs.writeFileSync(txFile, transcript, 'utf8');

    // edge-tts outputs MP3 directly
    await execAsync(
      `python3 scripts/tts.py "${txFile}" "${job.voice}" "${ttsAudio}"`,
      { cwd: __dirname, timeout: 5 * 60 * 1000 }
    );

    // Convert TTS MP3 → 16kHz WAV for Whisper re-transcription
    await execAsync(
      `npx remotion ffmpeg -i "${ttsAudio}" -ar 16000 -ac 1 "${ttsWav}" -y`,
      { cwd: __dirname }
    );
    await execAsync(
      `npx tsx scripts/transcribe.ts "${ttsWav}" "${finalCaps}"`,
      { cwd: __dirname, timeout: 10 * 60 * 1000 }
    );

    // Cleanup temp files
    for (const f of [txFile, ttsWav]) fs.rmSync(f, { force: true });

    // Get TTS audio duration
    const { stdout: ttsProbeRaw } = await execAsync(
      `npx remotion ffprobe -v quiet -print_format json -show_format "${ttsAudio}"`,
      { cwd: __dirname }
    );
    const ttsDurationSec = parseFloat(JSON.parse(ttsProbeRaw).format?.duration ?? '60');
    const durationInFrames = Math.ceil(Math.max(videoDurationSec, ttsDurationSec) * fps);

    // 5 ── Render with Remotion
    send({ step: 5, total: 5, label: 'Rendering final video…' });
    const props = {
      videoFile:        `uploads/${job.videoFilename}`,
      audioFile:        `audio/${jobId}-tts.mp3`,
      captionsFile:     `captions/${jobId}-final.json`,
      durationInFrames,
      width,
      height,
      fps,
    };
    fs.writeFileSync(propsFile, JSON.stringify(props));

    await execAsync(
      `npx remotion render src/index.ts VideoWithSubtitles "${outputPath}" --props="@${propsFile}" --log=error`,
      { cwd: __dirname, timeout: 60 * 60 * 1000 }
    );

    fs.rmSync(propsFile, { force: true });
    job.outputFilename = `${jobId}.mp4`;
    jobs.set(jobId, job);

    send({ step: 5, total: 5, label: 'Done!', status: 'done', downloadUrl: `/api/download/${jobId}` });

  } catch (err) {
    console.error('[process error]', err);
    send({ status: 'error', message: err.message });
  }

  res.end();
});

// ── Download ─────────────────────────────────────────────────────────────────
app.get('/api/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job?.outputFilename) return res.status(404).json({ error: 'Not ready yet' });
  res.download(path.join(PUBLIC_DIR, 'renders', job.outputFilename), 'video-with-subtitles.mp4');
});

const PORT = process.env.PORT ?? 3131;
app.listen(PORT, () => {
  console.log(`\n  Video Subtitle App  →  http://localhost:${PORT}\n`);
});
