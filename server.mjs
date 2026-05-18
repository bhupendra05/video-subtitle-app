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

// Create runtime directories
for (const dir of ['uploads', 'audio', 'captions', 'renders']) {
  fs.mkdirSync(path.join(PUBLIC_DIR, dir), { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/public', express.static(PUBLIC_DIR));
app.use('/', express.static(path.join(__dirname, 'web')));

// In-memory job store
const jobs = new Map();

// Multer — save uploads to public/uploads/
const storage = multer.diskStorage({
  destination: path.join(PUBLIC_DIR, 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

// ── Runtime API key override (user pastes key in browser UI) ────────────────
app.post('/api/set-key', (req, res) => {
  const { apiKey } = req.body ?? {};
  if (apiKey) process.env.ELEVENLABS_API_KEY = apiKey.trim();
  res.json({ ok: true });
});

// ── Upload endpoint ──────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const jobId = Date.now().toString();
  jobs.set(jobId, { status: 'uploaded', videoFilename: req.file.filename });
  res.json({ jobId });
});

// ── Process endpoint (SSE) ───────────────────────────────────────────────────
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
    const videoPath   = path.join(PUBLIC_DIR, 'uploads', job.videoFilename);
    const audioWav    = path.join(PUBLIC_DIR, 'audio',   `${jobId}.wav`);
    const origCaps    = path.join(PUBLIC_DIR, 'captions', `${jobId}-orig.json`);
    const elMp3       = path.join(PUBLIC_DIR, 'audio',   `${jobId}-el.mp3`);
    const elWav       = path.join(PUBLIC_DIR, 'audio',   `${jobId}-el.wav`);
    const finalCaps   = path.join(PUBLIC_DIR, 'captions', `${jobId}-final.json`);
    const propsFile   = path.join(PUBLIC_DIR, `${jobId}-props.json`);
    const outputPath  = path.join(PUBLIC_DIR, 'renders',  `${jobId}.mp4`);

    // 1 ── Extract 16kHz mono WAV for Whisper
    send({ step: 1, total: 5, label: 'Extracting audio from video…' });
    await execAsync(
      `npx remotion ffmpeg -i "${videoPath}" -ar 16000 -ac 1 "${audioWav}" -y`,
      { cwd: __dirname }
    );

    // 2 ── Read video metadata (dimensions, fps, duration)
    send({ step: 2, total: 5, label: 'Reading video metadata…' });
    const { stdout: probeRaw } = await execAsync(
      `npx remotion ffprobe -v quiet -print_format json -show_streams -show_format "${videoPath}"`,
      { cwd: __dirname }
    );
    const probe = JSON.parse(probeRaw);
    const vs = probe.streams.find((s) => s.codec_type === 'video') ?? probe.streams[0];
    const [fpsNum, fpsDen] = vs.r_frame_rate.split('/').map(Number);
    const fps = Math.round(fpsNum / fpsDen) || 30;
    const width  = parseInt(vs.width,  10);
    const height = parseInt(vs.height, 10);
    const videoDurationSec = parseFloat(probe.format?.duration ?? vs.duration ?? '60');

    // 3 ── Transcribe original audio → get the script text
    send({ step: 3, total: 5, label: 'Transcribing with Whisper — this takes 1-2 min on first run…' });
    await execAsync(
      `npx tsx scripts/transcribe.ts "${audioWav}" "${origCaps}"`,
      { cwd: __dirname, timeout: 10 * 60 * 1000 }
    );
    const origCaptions = JSON.parse(fs.readFileSync(origCaps, 'utf8'));
    const transcript = origCaptions.map((c) => c.text).join('').trim();

    if (!transcript) throw new Error('Whisper produced an empty transcript. Check the video has audible speech.');

    // 4 ── Generate ElevenLabs audio, then re-transcribe for accurate subtitle timing
    send({ step: 4, total: 5, label: 'Generating ElevenLabs voice (Adam)…' });
    const apiKey  = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB';

    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set in .env');

    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: transcript,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
      }),
    });

    if (!elRes.ok) throw new Error(`ElevenLabs error ${elRes.status}: ${await elRes.text()}`);
    fs.writeFileSync(elMp3, Buffer.from(await elRes.arrayBuffer()));

    // Convert ElevenLabs MP3 → WAV, re-transcribe to get synced subtitle timestamps
    await execAsync(
      `npx remotion ffmpeg -i "${elMp3}" -ar 16000 -ac 1 "${elWav}" -y`,
      { cwd: __dirname }
    );
    await execAsync(
      `npx tsx scripts/transcribe.ts "${elWav}" "${finalCaps}"`,
      { cwd: __dirname, timeout: 10 * 60 * 1000 }
    );

    // Get ElevenLabs audio duration
    const { stdout: elProbeRaw } = await execAsync(
      `npx remotion ffprobe -v quiet -print_format json -show_format "${elMp3}"`,
      { cwd: __dirname }
    );
    const elDurationSec = parseFloat(JSON.parse(elProbeRaw).format?.duration ?? '60');
    const durationInFrames = Math.ceil(Math.max(videoDurationSec, elDurationSec) * fps);

    // 5 ── Render with Remotion
    send({ step: 5, total: 5, label: 'Rendering final video — grab a coffee ☕…' });
    const props = {
      videoFile:      `uploads/${job.videoFilename}`,
      audioFile:      `audio/${jobId}-el.mp3`,
      captionsFile:   `captions/${jobId}-final.json`,
      durationInFrames,
      width,
      height,
      fps,
    };
    fs.writeFileSync(propsFile, JSON.stringify(props));

    await execAsync(
      `npx remotion render src/index.ts VideoWithSubtitles "${outputPath}" --props="@${propsFile}" --log=quiet`,
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

// ── Download endpoint ────────────────────────────────────────────────────────
app.get('/api/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job?.outputFilename) return res.status(404).json({ error: 'Not ready yet' });
  const filePath = path.join(PUBLIC_DIR, 'renders', job.outputFilename);
  res.download(filePath, 'video-with-subtitles.mp4');
});

const PORT = process.env.PORT ?? 3131;
app.listen(PORT, () => {
  console.log(`\n  Video Subtitle App  →  http://localhost:${PORT}\n`);
});
