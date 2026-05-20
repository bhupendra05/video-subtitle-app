#!/usr/bin/env node
/**
 * youtube-upload.mjs — Automated YouTube Shorts uploader
 *
 * Uses the YouTube Data API v3 with OAuth2 (one-time browser auth, then
 * tokens are cached in .youtube-token.json and auto-refreshed forever).
 *
 * ── First-time setup ─────────────────────────────────────────────────────────
 *  1. Go to https://console.cloud.google.com → New Project
 *  2. Enable "YouTube Data API v3"
 *  3. Credentials → OAuth 2.0 Client ID → Desktop App
 *  4. Download JSON → save as .youtube-oauth.json in this project root
 *  5. Run once:  node scripts/youtube-upload.mjs --auth
 *     (opens browser → sign in → paste code → done, token saved)
 *
 * ── Upload a video ───────────────────────────────────────────────────────────
 *  node scripts/youtube-upload.mjs --file public/renders/my-video.mp4
 *  node scripts/youtube-upload.mjs --file my.mp4 --title "Your Title" --schedule "2025-06-01T18:00:00Z"
 *
 * ── Pipeline integration ─────────────────────────────────────────────────────
 *  node scripts/create-short.mjs --topic "..." --images --upload
 *  (add --upload flag to create-short.mjs — see bottom of this file for wiring)
 *
 * ── Batch / scheduled upload ─────────────────────────────────────────────────
 *  node scripts/youtube-upload.mjs --batch queue.json
 *  (queue.json = array of { file, title, description, tags, scheduleAt })
 *
 * Output:  https://www.youtube.com/watch?v=VIDEO_ID
 */

import { readFileSync, writeFileSync, existsSync, statSync, createReadStream } from 'fs';
import { createServer }    from 'http';
import { createInterface } from 'readline';
import { URL }             from 'url';
import path                from 'path';
import { fileURLToPath }   from 'url';

try { const { config } = await import('dotenv'); config(); } catch {}

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.join(__dirname, '..');
const TOKEN_FILE  = path.join(ROOT, '.youtube-token.json');
const OAUTH_FILE  = path.join(ROOT, '.youtube-oauth.json');

// ── Logging ───────────────────────────────────────────────────────────────────
const log  = (...a) => console.log(' ', ...a);
const logE = (...a) => console.error('❌', ...a);
const logOk= (...a) => console.log('✅', ...a);

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (flag)      => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] ?? null : null; };
const hasFlag = (flag)      => args.includes(flag);

const doAuth     = hasFlag('--auth');
const videoFile  = getArg('--file');
const batchFile  = getArg('--batch');
const titleArg   = getArg('--title');
const descArg    = getArg('--description') || getArg('--desc');
const tagsArg    = getArg('--tags');          // comma-separated
const scheduleAt = getArg('--schedule');       // ISO-8601 e.g. "2025-06-01T18:00:00Z"
const privacy    = getArg('--privacy') || (scheduleAt ? 'private' : 'public');
// Category IDs: 22=People&Blogs, 28=Science&Tech, 24=Entertainment, 27=Education, 25=News
const category   = getArg('--category') || '28';

// ── OAuth2 flow ───────────────────────────────────────────────────────────────
function loadOAuthConfig() {
  if (!existsSync(OAUTH_FILE)) {
    logE(`OAuth credentials file not found: ${OAUTH_FILE}`);
    logE('Download it from Google Cloud Console → Credentials → OAuth 2.0 Client IDs → Desktop App');
    logE('Save as .youtube-oauth.json in your project root.');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(OAUTH_FILE, 'utf8'));
  // Google downloads wrap in { "installed": {...} } or { "web": {...} }
  return raw.installed ?? raw.web ?? raw;
}

function loadToken() {
  if (!existsSync(TOKEN_FILE)) return null;
  try { return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')); } catch { return null; }
}

function saveToken(token) {
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

async function getAccessToken() {
  const oauth = loadOAuthConfig();
  let   token = loadToken();

  // Refresh if expired (or within 5 minutes of expiry)
  if (token && token.expiry_date && Date.now() > token.expiry_date - 300_000) {
    log('🔄 Refreshing access token…');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     oauth.client_id,
        client_secret: oauth.client_secret,
        refresh_token: token.refresh_token,
        grant_type:    'refresh_token',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      logE(`Token refresh failed: ${JSON.stringify(data)}`);
      logE('Re-run: node scripts/youtube-upload.mjs --auth');
      process.exit(1);
    }
    token = {
      access_token:  data.access_token,
      refresh_token: token.refresh_token,   // refresh tokens don't rotate
      expiry_date:   Date.now() + data.expires_in * 1000,
    };
    saveToken(token);
    log('✅ Token refreshed');
  }

  if (!token?.access_token) {
    logE('Not authenticated. Run: node scripts/youtube-upload.mjs --auth');
    process.exit(1);
  }
  return token.access_token;
}

async function runAuthFlow() {
  const oauth = loadOAuthConfig();
  const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
  ].join(' ');

  // Try localhost redirect (Desktop app) first, fallback to OOB
  const REDIRECT_URI = oauth.redirect_uris?.find(u => u.includes('localhost'))
    ?? 'urn:ietf:wg:oauth:2.0:oob';

  const useLocalhost = REDIRECT_URI.startsWith('http://localhost');
  const port         = useLocalhost ? new URL(REDIRECT_URI).port || 8080 : null;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id',     oauth.client_id);
  authUrl.searchParams.set('redirect_uri',  REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope',         SCOPES);
  authUrl.searchParams.set('access_type',   'offline');
  authUrl.searchParams.set('prompt',        'consent');   // force refresh_token

  console.log('\n🔐 YouTube OAuth2 Setup');
  console.log('─'.repeat(50));
  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl.toString());
  console.log('');

  // Open browser automatically
  try {
    const { exec } = await import('child_process');
    const opener = process.platform === 'darwin' ? 'open' :
                   process.platform === 'win32'  ? 'start' : 'xdg-open';
    exec(`${opener} "${authUrl.toString()}"`);
  } catch {}

  let code;

  if (useLocalhost) {
    // Spin up a local server to catch the redirect automatically
    code = await new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const c   = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<h2 style="font-family:sans-serif;color:green">✅ Authorized! You can close this tab.</h2>`);
        server.close();
        if (c) resolve(c); else reject(new Error('No code in redirect'));
      });
      server.listen(port, () => log(`Waiting for OAuth redirect on port ${port}…`));
      server.on('error', reject);
      setTimeout(() => { server.close(); reject(new Error('Auth timeout (3 min)')); }, 180_000);
    });
  } else {
    // Manual OOB: ask user to paste the code
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    code = await new Promise(resolve => rl.question('Paste the authorization code here: ', ans => {
      rl.close(); resolve(ans.trim());
    }));
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     oauth.client_id,
      client_secret: oauth.client_secret,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    logE('Token exchange failed:', JSON.stringify(tokenData));
    process.exit(1);
  }

  const token = {
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date:   Date.now() + tokenData.expires_in * 1000,
  };
  saveToken(token);

  console.log('\n✅ Authentication successful!');
  console.log(`   Token saved → ${TOKEN_FILE}`);
  console.log('\nYou can now upload videos:');
  console.log('  node scripts/youtube-upload.mjs --file your-video.mp4\n');
}

// ── Build video metadata ──────────────────────────────────────────────────────
function buildMetadata({ title, description, tags, scheduleAt, privacy, category, script }) {
  // Auto-derive title from script if not provided
  const headline = script?.titleCard?.headline ?? '';
  const subline  = script?.titleCard?.subline  ?? '';
  const topic    = script?.topic ?? '';

  const autoTitle = headline
    ? `${headline} | ${subline}`.slice(0, 100)
    : topic.slice(0, 100);

  const finalTitle = title || autoTitle || 'AI Short';

  // Build description with hashtags
  const scriptHashtags = (script?.hashtags ?? []).map(h => `#${h.replace(/^#/, '')}`).join(' ');
  const narration      = script?.narration ?? '';
  const autoDesc = [
    narration.slice(0, 500),
    '',
    scriptHashtags,
    '#Shorts',
  ].filter(Boolean).join('\n');

  const finalDesc = description || autoDesc;

  // Tags: from --tags flag + script hashtags
  const argTags    = tags ? tags.split(',').map(t => t.trim()) : [];
  const scriptTags = script?.hashtags ?? [];
  const allTags    = [...new Set(['Shorts', 'AIShorts', ...argTags, ...scriptTags])].slice(0, 500);

  const privacyStatus = scheduleAt ? 'private' : (privacy || 'public');

  return {
    snippet: {
      title:       finalTitle,
      description: finalDesc,
      tags:        allTags,
      categoryId:  category || '28',
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
      ...(scheduleAt ? { publishAt: new Date(scheduleAt).toISOString() } : {}),
    },
  };
}

// ── Resumable upload with progress bar ───────────────────────────────────────
async function uploadVideo(filePath, metadata, accessToken) {
  const fileSize = statSync(filePath).size;
  const fileMB   = (fileSize / 1024 / 1024).toFixed(1);
  log(`📤 Uploading: ${path.basename(filePath)} (${fileMB} MB)`);

  // Step 1: Initiate resumable upload session
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${accessToken}`,
        'Content-Type':    'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Failed to initiate upload (${initRes.status}): ${err.slice(0, 400)}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw new Error('No upload URL returned from YouTube API');
  log(`   Upload session started`);

  // Step 2: Stream the file in chunks with progress
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks
  let uploaded = 0;
  let videoId  = null;

  while (uploaded < fileSize) {
    const chunkEnd  = Math.min(uploaded + CHUNK_SIZE, fileSize);
    const chunkSize = chunkEnd - uploaded;

    // Read chunk
    const chunk = await readChunk(filePath, uploaded, chunkSize);

    // Upload chunk
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunkSize),
        'Content-Range':  `bytes ${uploaded}-${chunkEnd - 1}/${fileSize}`,
        'Content-Type':   'video/mp4',
      },
      body: chunk,
    });

    if (chunkRes.status === 308) {
      // Incomplete — continue
      const range = chunkRes.headers.get('range');
      uploaded = range ? parseInt(range.split('-')[1]) + 1 : chunkEnd;
    } else if (chunkRes.status === 200 || chunkRes.status === 201) {
      // Complete!
      const data = await chunkRes.json();
      videoId  = data.id;
      uploaded = fileSize;
    } else if (chunkRes.status === 503 || chunkRes.status === 500) {
      // Transient error — retry same chunk after delay
      log(`   Server error ${chunkRes.status}, retrying chunk…`);
      await sleep(5000);
      continue;
    } else {
      const err = await chunkRes.text();
      throw new Error(`Chunk upload failed (${chunkRes.status}): ${err.slice(0, 300)}`);
    }

    // Progress bar
    const pct     = Math.round((uploaded / fileSize) * 100);
    const bars    = Math.round(pct / 5);
    const bar     = '█'.repeat(bars) + '░'.repeat(20 - bars);
    process.stdout.write(`\r   [${bar}] ${pct}% — ${(uploaded / 1024 / 1024).toFixed(1)} MB / ${fileMB} MB  `);
  }
  process.stdout.write('\n');

  if (!videoId) throw new Error('Upload completed but no video ID returned');
  return videoId;
}

// Read a chunk from file as a Buffer
function readChunk(filePath, start, length) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = createReadStream(filePath, { start, end: start + length - 1 });
    stream.on('data', c => chunks.push(c));
    stream.on('end',  () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Load script JSON (finds most recent one if not specified) ─────────────────
function loadScript(scriptPath) {
  // If explicit path given
  if (scriptPath && existsSync(scriptPath)) {
    return JSON.parse(readFileSync(scriptPath, 'utf8'));
  }
  // Auto-find most recent *-script.json in public/
  const publicDir = path.join(ROOT, 'public');
  if (!existsSync(publicDir)) return null;
  try {
    const files = readdirSync(publicDir)
      .filter(f => f.endsWith('-script.json'))
      .map(f => ({ f, mtime: statSync(path.join(publicDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length) return JSON.parse(readFileSync(path.join(publicDir, files[0].f), 'utf8'));
  } catch {}
  return null;
}

function readdirSync(dir) {
  const { readdirSync: rd } = await_import_sync('fs');
  return rd(dir);
}

// Synchronous import workaround (fs is already available at module scope)
import { readdirSync as _readdirSync } from 'fs';

// ── Single video upload ───────────────────────────────────────────────────────
async function uploadSingle(filePath, opts = {}) {
  if (!existsSync(filePath)) {
    logE(`File not found: ${filePath}`);
    process.exit(1);
  }

  const accessToken = await getAccessToken();

  // Try to load matching script for auto-metadata
  const scriptPath = opts.scriptPath || getArg('--script');
  let script = null;
  if (scriptPath) {
    script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  } else {
    // Auto-find most recent script JSON
    const publicDir = path.join(ROOT, 'public');
    if (existsSync(publicDir)) {
      try {
        const files = _readdirSync(publicDir)
          .filter(f => f.endsWith('-script.json'))
          .map(f => ({ f, mtime: statSync(path.join(publicDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files.length) {
          script = JSON.parse(readFileSync(path.join(publicDir, files[0].f), 'utf8'));
          log(`📄 Auto-loaded script: ${files[0].f}`);
        }
      } catch {}
    }
  }

  const metadata = buildMetadata({
    title:       opts.title       || titleArg,
    description: opts.description || descArg,
    tags:        opts.tags        || tagsArg,
    scheduleAt:  opts.scheduleAt  || scheduleAt,
    privacy:     opts.privacy     || privacy,
    category:    opts.category    || category,
    script,
  });

  console.log('\n📋 Upload metadata:');
  console.log(`   Title:    ${metadata.snippet.title}`);
  console.log(`   Privacy:  ${metadata.status.privacyStatus}`);
  if (metadata.status.publishAt) {
    console.log(`   Schedule: ${metadata.status.publishAt}`);
  }
  console.log(`   Tags:     ${metadata.snippet.tags.slice(0, 5).join(', ')}…`);
  console.log('');

  const videoId = await uploadVideo(filePath, metadata, accessToken);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const shortUrl = `https://www.youtube.com/shorts/${videoId}`;

  console.log('');
  logOk(`Upload complete!`);
  console.log(`\n   🔗 Video URL:  ${videoUrl}`);
  console.log(`   📱 Shorts URL: ${shortUrl}`);
  console.log(`   🆔 Video ID:   ${videoId}\n`);

  // Append to upload log
  const logEntry = {
    videoId, videoUrl, shortUrl,
    title:      metadata.snippet.title,
    file:       path.basename(filePath),
    uploadedAt: new Date().toISOString(),
    privacy:    metadata.status.privacyStatus,
    scheduleAt: metadata.status.publishAt ?? null,
  };
  const logFile = path.join(ROOT, '.youtube-upload-log.json');
  let uploadLog = [];
  if (existsSync(logFile)) {
    try { uploadLog = JSON.parse(readFileSync(logFile, 'utf8')); } catch {}
  }
  uploadLog.unshift(logEntry);
  writeFileSync(logFile, JSON.stringify(uploadLog, null, 2));
  log(`📝 Logged → ${logFile}`);

  return videoId;
}

// ── Batch upload from queue JSON ──────────────────────────────────────────────
/**
 * queue.json format:
 * [
 *   {
 *     "file": "public/renders/video1.mp4",
 *     "title": "My Short Title #Shorts",
 *     "description": "Optional description",
 *     "tags": "tag1,tag2,tag3",
 *     "scheduleAt": "2025-06-01T18:00:00Z",   // optional ISO-8601
 *     "privacy": "private",                    // public|private|unlisted
 *     "delayBetweenUploads": 30               // seconds to wait between uploads
 *   },
 *   ...
 * ]
 */
async function uploadBatch(batchFilePath) {
  if (!existsSync(batchFilePath)) {
    logE(`Batch file not found: ${batchFilePath}`);
    process.exit(1);
  }

  const queue = JSON.parse(readFileSync(batchFilePath, 'utf8'));
  if (!Array.isArray(queue) || !queue.length) {
    logE('Batch file must be a non-empty JSON array');
    process.exit(1);
  }

  console.log(`\n📦 Batch upload: ${queue.length} video(s)`);
  console.log('─'.repeat(50));

  const results = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    console.log(`\n[${i + 1}/${queue.length}] ${path.basename(item.file)}`);

    try {
      const videoId = await uploadSingle(
        path.resolve(ROOT, item.file),
        {
          title:       item.title,
          description: item.description,
          tags:        item.tags,
          scheduleAt:  item.scheduleAt,
          privacy:     item.privacy,
          category:    item.category,
          scriptPath:  item.scriptPath,
        },
      );
      results.push({ file: item.file, videoId, status: 'ok' });
    } catch (err) {
      logE(`Upload failed for ${item.file}: ${err.message}`);
      results.push({ file: item.file, status: 'error', error: err.message });
    }

    // Delay between uploads to avoid rate limiting
    if (i < queue.length - 1) {
      const delay = (item.delayBetweenUploads ?? 15) * 1000;
      log(`⏳ Waiting ${delay / 1000}s before next upload…`);
      await sleep(delay);
    }
  }

  console.log('\n📊 Batch results:');
  for (const r of results) {
    const icon = r.status === 'ok' ? '✅' : '❌';
    console.log(`  ${icon}  ${path.basename(r.file)} → ${r.videoId ?? r.error}`);
  }

  const ok  = results.filter(r => r.status === 'ok').length;
  const err = results.filter(r => r.status === 'error').length;
  console.log(`\n  Total: ${ok} uploaded, ${err} failed\n`);
}

// ── Show upload log ───────────────────────────────────────────────────────────
function showLog() {
  const logFile = path.join(ROOT, '.youtube-upload-log.json');
  if (!existsSync(logFile)) { console.log('No uploads yet.'); return; }
  const entries = JSON.parse(readFileSync(logFile, 'utf8'));
  console.log('\n📋 Upload history:\n');
  for (const e of entries.slice(0, 20)) {
    console.log(`  ${e.uploadedAt.slice(0, 10)} | ${e.title.slice(0, 40).padEnd(40)} | ${e.shortUrl}`);
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(`
youtube-upload.mjs — Automated YouTube Shorts uploader

Setup (one-time):
  node scripts/youtube-upload.mjs --auth

Upload:
  node scripts/youtube-upload.mjs --file public/renders/video.mp4
  node scripts/youtube-upload.mjs --file video.mp4 --title "My Short #Shorts"
  node scripts/youtube-upload.mjs --file video.mp4 --schedule "2025-06-01T18:00:00Z"
  node scripts/youtube-upload.mjs --file video.mp4 --privacy unlisted

Batch:
  node scripts/youtube-upload.mjs --batch upload-queue.json

History:
  node scripts/youtube-upload.mjs --log

Options:
  --auth          Run OAuth2 browser login (one-time setup)
  --file <path>   Video file to upload
  --title <str>   Video title (auto-generated from script if omitted)
  --desc  <str>   Description (auto-generated from script if omitted)
  --tags  <str>   Comma-separated tags (merged with script hashtags)
  --schedule <t>  Schedule publish time (ISO-8601 UTC, sets privacy=private)
  --privacy <s>   public | private | unlisted  (default: public)
  --category <n>  YouTube category ID (default: 28=Science&Tech)
  --script <path> Path to script JSON (auto-detected if omitted)
  --batch <path>  Upload multiple videos from a queue JSON file
  --log           Show recent upload history
`);
    return;
  }

  if (doAuth) {
    await runAuthFlow();
    return;
  }

  if (hasFlag('--log')) {
    showLog();
    return;
  }

  if (batchFile) {
    await uploadBatch(batchFile);
    return;
  }

  if (!videoFile) {
    console.log('Usage: node scripts/youtube-upload.mjs --file <video.mp4>');
    console.log('       node scripts/youtube-upload.mjs --auth   (first-time setup)');
    console.log('       node scripts/youtube-upload.mjs --help   (full options)');
    process.exit(1);
  }

  await uploadSingle(videoFile);
}

main().catch(err => { logE(err.message); process.exit(1); });
