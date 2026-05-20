#!/usr/bin/env node
/**
 * generate-script.mjs — AI-powered YouTube Shorts script generator
 *
 * Priority order:
 *   1. Gemini 2.5 Flash  (fast + smart, needs GEMINI_API_KEY — free tier available)
 *   2. Ollama            (local LLM, zero cost, needs `ollama` installed)
 *   3. Claude Haiku      (fallback, needs ANTHROPIC_API_KEY)
 *
 * Usage:
 *   node scripts/generate-script.mjs --topic "AI taking over jobs"
 *   node scripts/generate-script.mjs --topic "..." --output scripts/out.json
 *
 * Output JSON shape:
 *   {
 *     topic, colorScheme, titleCard: { headline, subline },
 *     narration, stats: [{ label, value }], cta, hashtags
 *   }
 */

import { writeFileSync } from 'fs';

try { const { config } = await import('dotenv'); config(); } catch {}

const GEMINI_KEY    = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL  = 'gemini-2.5-flash';
const OLLAMA_URL    = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL || 'llama3.1';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

// All status logs go to stderr so stdout stays clean for JSON output
const log  = (...a) => process.stderr.write(a.join(' ') + '\n');
const logE = (...a) => process.stderr.write(a.join(' ') + '\n');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const topic  = getArg('--topic');
const output = getArg('--output');

if (!topic) {
  logE('Usage: node scripts/generate-script.mjs --topic "Your topic here"');
  process.exit(1);
}

// ── Prompt ───────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an elite YouTube Shorts scriptwriter creating VIRAL, emotionally charged content. Your scripts make viewers feel shock, urgency, excitement, or fear. You write like a news anchor who just uncovered a shocking truth and has 60 seconds to share it. Every word earns its place. You NEVER use filler. Hook in the FIRST 4 words. Build emotional tension. End with a gut punch that makes people comment and share.`;

const USER_PROMPT = `Create a YouTube Shorts script about: "${topic}"

Return ONLY a valid JSON object with this exact shape (no markdown, no explanation):
{
  "topic": "${topic}",
  "colorScheme": "cyber-green",
  "titleCard": {
    "headline": "3-4 WORD HEADLINE IN CAPS",
    "subline": "One shocking sentence that makes viewers stop scrolling"
  },
  "narration": "ONE continuous paragraph, 110-130 words. NO line breaks, NO ellipsis. Written to be read in 50-60 seconds at a fast, urgent pace. Start with a shocking statement in the first 4 words. Build with facts and emotion. Drop a specific statistic mid-video. End with a call to action that creates urgency. Use active voice. Short punchy sentences. Make it feel URGENT.",
  "stats": [
    { "label": "STAT LABEL", "value": "NUMBER OR %" },
    { "label": "STAT LABEL", "value": "NUMBER OR %" },
    { "label": "STAT LABEL", "value": "NUMBER OR %" }
  ],
  "cta": "FOLLOW FOR MORE",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Rules:
- colorScheme must be one of: teal-gold, cyber-green, fire-red, electric-blue, solar, clean-blue
- Choose colorScheme: gold=finance/crypto, green=tech/AI, red=urgent/health, blue=space/future, solar=motivation/lifestyle, clean-blue=business/news
- narration MUST be 110-130 words, ONE paragraph, no newlines, fast-paced, high emotion
- stats: exactly 3 items with real or plausible compelling numbers
- hashtags: exactly 5 items, no # prefix
- cta: short call to action in CAPS (max 4 words)
- headline: 2-4 WORDS IN ALL CAPS, shocking or intriguing
- Return ONLY the JSON object, nothing else`;

// ── Gemini generator (primary) ───────────────────────────────────────────────
async function generateWithGemini(prompt) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
  log(`  🔵 Using Gemini ${GEMINI_MODEL}…`);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, topP: 0.9, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 200)}`);
  return text;
}

// ── Ollama generator ──────────────────────────────────────────────────────────
async function generateWithOllama(prompt) {
  log(`  🦙 Trying Ollama (${OLLAMA_MODEL})…`);
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
      stream: false,
      options: { temperature: 0.8, top_p: 0.9 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return data.response;
}

// ── Claude Haiku generator ────────────────────────────────────────────────────
async function generateWithClaude(prompt) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  log('  🤖 Using Claude Haiku…');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ── JSON extractor ────────────────────────────────────────────────────────────
function extractJson(raw) {
  // Strip any markdown fences
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // Find the outermost {...}
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');

  const jsonStr = cleaned.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

// ── Validator + fixer ─────────────────────────────────────────────────────────
const VALID_SCHEMES = ['teal-gold', 'cyber-green', 'fire-red', 'electric-blue'];

function validateScript(obj, topic) {
  if (!obj.topic)       obj.topic = topic;
  if (!obj.narration)   throw new Error('Missing narration field');
  if (!obj.titleCard?.headline) throw new Error('Missing titleCard.headline');
  if (!VALID_SCHEMES.includes(obj.colorScheme)) obj.colorScheme = 'cyber-green';
  if (!Array.isArray(obj.stats))   obj.stats = [];
  if (!Array.isArray(obj.hashtags)) obj.hashtags = [topic.replace(/\s+/g, ''), 'Shorts'];
  if (!obj.cta) obj.cta = 'FOLLOW FOR MORE';
  if (!obj.titleCard.subline) obj.titleCard.subline = '';
  // Ensure hashtags have no # prefix
  obj.hashtags = obj.hashtags.map(h => h.replace(/^#/, ''));
  return obj;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`\n🎬 Generating script for: "${topic}"`);
  log('─'.repeat(50));

  let raw = null;

  // 1. Try Gemini first (fast, free tier available)
  if (GEMINI_KEY) {
    try {
      raw = await generateWithGemini(USER_PROMPT);
      log('  ✅ Gemini responded');
    } catch (err) {
      log(`  ⚠️  Gemini failed: ${err.message} — trying Ollama…`);
    }
  }

  // 2. Ollama (local, free)
  if (!raw) {
    try {
      raw = await generateWithOllama(USER_PROMPT);
      log('  ✅ Ollama responded');
    } catch (err) {
      log(`  ⚠️  Ollama failed: ${err.message}`);

      // 3. Claude Haiku fallback
      try {
        raw = await generateWithClaude(USER_PROMPT);
        log('  ✅ Claude responded');
      } catch (err2) {
        logE(`\n❌ All generators failed.`);
        logE(`   Gemini: ${GEMINI_KEY ? 'failed' : 'no key'}`);
        logE(`   Ollama: ${err.message}`);
        logE(`   Claude: ${err2.message}`);
        logE(`\nTo fix — pick one:`);
        logE(`  Gemini (free): add GEMINI_API_KEY to .env`);
        logE(`  Ollama (free): https://ollama.ai → ollama pull llama3.1`);
        logE(`  Claude: add ANTHROPIC_API_KEY to .env`);
        process.exit(1);
      }
    }
  }

  // Parse and validate
  let script;
  try {
    const parsed = extractJson(raw);
    script = validateScript(parsed, topic);
  } catch (err) {
    logE(`\n❌ Failed to parse AI response as JSON: ${err.message}`);
    logE('Raw response:\n', raw?.slice(0, 500));
    process.exit(1);
  }

  // Print summary
  log('\n📄 Script:');
  log(`   Topic:      ${script.topic}`);
  log(`   Headline:   ${script.titleCard.headline}`);
  log(`   Scheme:     ${script.colorScheme}`);
  log(`   Narration:  ${script.narration.slice(0, 80)}…`);
  log(`   Stats:      ${script.stats.map(s => `${s.label}: ${s.value}`).join(', ')}`);
  log(`   CTA:        ${script.cta}`);
  log(`   Hashtags:   ${script.hashtags.map(h => '#' + h).join(' ')}`);

  // Write output
  if (output) {
    writeFileSync(output, JSON.stringify(script, null, 2));
    log(`\n✅ Saved → ${output}`);
  } else {
    // Print to stdout so orchestrator can pipe it
    process.stdout.write(JSON.stringify(script));
  }
}

main();
