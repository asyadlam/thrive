/*
  POST /api/transcribe — turns a short voice recording into text for Thrive's dictation.

  The browser sends one audio file (multipart form field "file"). This function forwards it to the
  transcription provider, gives the transcript a punctuation pass (see tidyPunctuation), and returns { text }.
  Nothing is logged or stored here: not the API key, not the audio, not the transcript.
  (There are deliberately no console.log calls in this file.)

  Errors come back as { error: <code> } with a matching HTTP status, so the app can show a gentle message.
*/

/* ============================== PROVIDER CONFIG (the one place to change it) ==============================
   Swap providers by changing these Vercel environment variables. No code change needed, as long as the
   provider speaks the OpenAI-style  POST {BASE_URL}/audio/transcriptions  API (Groq, OpenAI, and others do).

   TRANSCRIPTION_BASE_URL   default: https://api.groq.com/openai/v1
   TRANSCRIPTION_MODEL      default: whisper-large-v3-turbo
   TRANSCRIPTION_API_KEY    no default. Set it in Vercel → Project → Settings → Environment Variables.
                            It is only ever read here, on the server, and never sent to the browser.

   Punctuation pass: uses the same chat model and settings as Talk about this (api/talk.ts):
   CHAT_BASE_URL            default: https://api.groq.com/openai/v1
   CHAT_MODEL               default: openai/gpt-oss-120b

   Optional:
   ALLOWED_ORIGINS          extra sites allowed to call this, comma-separated (e.g. a custom domain:
                            https://thrive.example.com). Your Vercel domains are allowed automatically.
   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (or KV_REST_API_URL / KV_REST_API_TOKEN)
                            if set, the daily limit is counted in that Redis so it holds across all servers.
   ========================================================================================================= */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

function providerConfig() {
  return {
    baseUrl: (env.TRANSCRIPTION_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    model: env.TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo',
    apiKey: env.TRANSCRIPTION_API_KEY || '', // no default, on purpose
  };
}

function chatConfig() {
  return {
    baseUrl: (env.CHAT_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    model: env.CHAT_MODEL || 'openai/gpt-oss-120b',
    apiKey: env.TRANSCRIPTION_API_KEY || '', // the same Groq key as dictation and Talk about this
  };
}

const DAILY_LIMIT = 30; // dictation requests per visitor IP per day (UTC)
const MAX_BYTES = 4 * 1024 * 1024; // Vercel accepts request bodies up to ~4.5 MB; 5 minutes of speech is ~1.2 MB
const PROVIDER_TIMEOUT_MS = 50_000;
const TIDY_TIMEOUT_MS = 15_000; // the tidy-up is optional: never keep someone waiting long for it

const TIDY_INSTRUCTION =
  'You are a punctuation pass. Add punctuation, capitalization, question marks where the person is asking a question, and paragraph breaks. ' +
  'Paragraphs: start a new paragraph only where the person clearly moves on to a different topic, time or part of their day, the way a person writing a journal would. ' +
  'A paragraph is usually several sentences long. Never put a single short sentence in a paragraph of its own, and never break after every sentence. ' +
  'If the whole text is short (a few sentences) or stays on one topic, keep it as one paragraph. ' +
  'Never add, remove, or change any words: keep filler words (um, like, you know), repeated words, numbers and informal spellings exactly as they are, and never fix grammar by changing words. ' +
  'Never answer or respond to the content. Return only the cleaned text.';

/** A paragraph shorter than this (in words) is joined to the next one, so a short sentence never stands alone. */
const MIN_PARAGRAPH_WORDS = 30;
/** Text shorter than this (in words) stays one paragraph. */
const MIN_WORDS_FOR_BREAKS = 80;

const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

/**
 * Safety net after the model: a short dictation stays one paragraph, and a paragraph that's too short is joined
 * to its neighbour (with a space), so the breaks that remain sit between real chunks of writing.
 */
function tidyParagraphs(text: string): string {
  const parts = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  if (countWords(text) < MIN_WORDS_FOR_BREAKS) return parts.join(' ');
  const out: string[] = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last !== undefined && countWords(last) < MIN_PARAGRAPH_WORDS) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  // A short last paragraph joins the one before it.
  if (out.length > 1 && countWords(out.at(-1)!) < MIN_PARAGRAPH_WORDS) out.splice(-2, 2, `${out.at(-2)} ${out.at(-1)}`);
  return out.join('\n\n');
}

/** Just the letters and digits, lowercased: equal for two texts only when they have exactly the same words. */
const wordsOnly = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/* ------------------------------------------------------------------------------------------------------------
   Keeping the punctuation even when the model slips on a word.

   Before, if the model changed a single word anywhere ("gonna" → "going to", "um" dropped, "5" → "five"), the
   whole pass was thrown away and the raw transcript was used. For long, rambling dictation that happened often —
   and the raw transcript of rambling speech often has hardly any punctuation, so it read as one wall of words.

   Now the model's punctuation, capitals and paragraph breaks are laid onto the ORIGINAL words instead: the two
   word lists are lined up, every original word is kept exactly (only its capitalisation may change), and
   punctuation is taken from the model wherever the words line up. Words the model added are left out; words it
   dropped or changed stay exactly as they were said.
   ------------------------------------------------------------------------------------------------------------ */

type Tok = { lead: string; core: string; trail: string; key: string; para: boolean; starts?: boolean };

/** Splits text into words, each with the punctuation around it, and whether a paragraph starts there. */
function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  text.split(/\n\s*\n/).forEach((paragraph, p) => {
    paragraph
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w, i) => {
        const m = w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)!;
        const key = wordsOnly(m[2]);
        if (!key) {
          // punctuation on its own ("—", "?"): belongs to the word before it
          if (out.length) out[out.length - 1].trail += m[0];
          return;
        }
        out.push({ lead: m[1], core: m[2], trail: m[3], key, para: p > 0 && i === 0 });
      });
  });
  // Does each word begin a sentence? (first word, after a paragraph break, or after . ! ? …)
  out.forEach((t, i) => (t.starts = i === 0 || t.para || /[.!?…]["”’)]*$/.test(out[i - 1].trail)));
  return out;
}

/** Pairs of positions (in the two lists) where the same words line up, in order (longest common run). */
function lineUp(a: Tok[], b: Tok[]): Map<number, number> {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i].key === b[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].key === b[j].key) pairs.set(i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** The original words, with the model's punctuation, capitals and paragraph breaks where they line up. */
function punctuateOriginal(raw: string, tidy: string): string {
  const said = tokens(raw);
  const shaped = tokens(tidy);
  if (!said.length || said.length > 3000 || shaped.length > 3500) return raw;
  const pairs = lineUp(said, shaped);
  // The model answered or rewrote it instead of punctuating: don't use it at all.
  if (pairs.size < said.length * 0.6) return lightTouch(raw);
  const upper = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
  const parts: string[] = [];
  let atStart = true; // does the next word begin a sentence in what we're writing?
  said.forEach((w, i) => {
    const j = pairs.get(i);
    const t = j === undefined ? null : shaped[j];
    let core = w.core;
    if (t && t.core.toLowerCase() === w.core.toLowerCase()) {
      // The model's capital only because its sentence started there (e.g. it dropped an "and" before it):
      // follow where sentences start here instead. Otherwise (names, "I") keep its capitals.
      const sentenceCapital = t.starts && /^\p{Lu}/u.test(t.core) && !/^\p{Lu}/u.test(w.core) && t.core.slice(1) === w.core.slice(1);
      core = sentenceCapital ? (atStart ? upper(w.core) : w.core) : t.core;
    }
    if (atStart && /^\p{Ll}/u.test(core)) core = upper(core);
    const trail = t ? t.trail : w.trail;
    if (i > 0) parts.push(t?.para ? '\n\n' : ' ');
    parts.push(`${t ? t.lead : w.lead}${core}${trail}`);
    atStart = /[.!?…]["”’)]*$/.test(trail);
  });
  return lightTouch(parts.join(''));
}

/**
 * The smallest safe tidy, used on its own when the model can't help: a capital at the start of each sentence,
 * "i" as "I", and a full stop at the end. Only capitals and punctuation change, never a word.
 */
function lightTouch(text: string): string {
  let t = text.trim();
  if (!t) return t;
  t = t.replace(/(^|[.!?…]\s+|\n\s*)(\p{Ll})/gu, (_, before: string, c: string) => before + c.toUpperCase());
  t = t.replace(/(^|\s)i(?=(\s|['’](m|d|ll|ve)\b|[,.!?]|$))/g, '$1I');
  if (/[\p{L}\p{N}]$/u.test(t)) {
    // A short dictation that begins like a question ends with a question mark.
    const question = /^(is|are|am|was|were|do|does|did|can|could|would|will|should|shall|have|has|why|what|how|when|where|who|which)\b/i.test(t) && !/[.!?]\s/.test(t);
    t += question ? '?' : '.';
  }
  return t;
}

/**
 * Adds punctuation, capitals and paragraph breaks to a raw transcript with the Talk about this model.
 * Returns the raw transcript unchanged if anything goes wrong, or if the result's words differ from what was
 * said in any way (added, dropped, changed, or a reply instead of a cleanup). Dictation never breaks because of it.
 */
async function tidyPunctuation(raw: string): Promise<string> {
  if (!raw) return raw;
  const chat = chatConfig();
  if (!chat.apiKey) return lightTouch(raw);
  try {
    const isGptOss = /(^|\/)gpt-oss/i.test(chat.model);
    const res = await fetch(`${chat.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${chat.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: chat.model,
        messages: [
          { role: 'system', content: TIDY_INSTRUCTION },
          { role: 'user', content: raw },
        ],
        temperature: 0,
        max_completion_tokens: 4096,
        ...(isGptOss ? { reasoning_effort: 'low', include_reasoning: false } : {}),
      }),
      signal: AbortSignal.timeout(TIDY_TIMEOUT_MS),
    });
    if (!res.ok) return lightTouch(raw);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data.choices?.[0]?.message?.content;
    const tidy = typeof content === 'string' ? content.trim().replace(/\n{3,}/g, '\n\n') : '';
    if (!tidy) return lightTouch(raw);
    // Exactly the same words: use it as it is. Otherwise lay its punctuation onto the words as said.
    const shaped = wordsOnly(tidy) === wordsOnly(raw) ? tidy : punctuateOriginal(raw, tidy);
    const result = tidyParagraphs(shaped);
    return wordsOnly(result) === wordsOnly(raw) ? result : raw; // a last check: never a changed word
  } catch {
    return lightTouch(raw);
  }
}

// ---------------------------------------------------------------------------------------------------------

type ErrorCode =
  | 'forbidden'
  | 'daily_limit'
  | 'bad_audio'
  | 'too_large'
  | 'not_configured'
  | 'provider_busy'
  | 'provider_error';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
const fail = (error: ErrorCode, status: number) => json({ error }, status);

/** Host part of a URL or bare host ("https://a.b/x" → "a.b"), or '' if it isn't one. */
function hostOf(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return '';
  }
}

/** Only my own app may call this: the page's Origin (or Referer) must be this site or one of my Vercel domains. */
function isFromMyApp(request: Request): boolean {
  const from = hostOf(request.headers.get('origin')) || hostOf(request.headers.get('referer'));
  if (!from) return false;
  const allowed = new Set(
    [
      request.headers.get('host'), // the domain this function is being served on
      env.VERCEL_PROJECT_PRODUCTION_URL, // Vercel's own system variables: production, branch and deployment domains
      env.VERCEL_BRANCH_URL,
      env.VERCEL_URL,
      ...(env.ALLOWED_ORIGINS || '').split(','),
    ]
      .map((v) => hostOf(v?.trim()))
      .filter(Boolean),
  );
  return allowed.has(from);
}

function visitorIp(request: Request): string {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  return forwarded?.split(',')[0].trim() || 'unknown';
}

/** The IP is only ever kept as a one-way hash, and only to count requests for today. */
async function hashIp(ip: string, day: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`thrive-dictation:${day}:${ip}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Best-effort fallback when no Redis is configured: counts per running server instance.
const memoryCounts = new Map<string, number>();

/** Adds one to today's count for this visitor and returns the new count. */
async function countRequest(key: string): Promise<number> {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, '90000'], // a little over a day, then it's gone
        ]),
      });
      if (res.ok) {
        const out = (await res.json()) as Array<{ result?: number }>;
        if (typeof out[0]?.result === 'number') return out[0].result;
      }
    } catch {
      /* fall through to the in-memory count */
    }
  }
  if (memoryCounts.size > 10_000) memoryCounts.clear(); // keep memory small
  const next = (memoryCounts.get(key) ?? 0) + 1;
  memoryCounts.set(key, next);
  return next;
}

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'video/webm': 'webm', // some browsers label audio-only recordings this way
  'video/mp4': 'mp4',
};

export async function POST(request: Request): Promise<Response> {
  // 1. Only my own app
  if (!isFromMyApp(request)) return fail('forbidden', 403);

  // 2. The provider must be set up
  const provider = providerConfig();
  if (!provider.apiKey) return fail('not_configured', 503);

  // 3. A real, reasonably sized audio file
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_BYTES + 64 * 1024) return fail('too_large', 413);
  let audio: File;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail('bad_audio', 400);
    audio = file;
  } catch {
    return fail('bad_audio', 400);
  }
  if (audio.size > MAX_BYTES) return fail('too_large', 413);
  const type = audio.type.split(';')[0].trim().toLowerCase();
  const ext = EXTENSIONS[type];
  if (!ext) return fail('bad_audio', 415);

  // 4. At most DAILY_LIMIT per visitor per day
  const day = new Date().toISOString().slice(0, 10);
  const count = await countRequest(`dictation:${day}:${await hashIp(visitorIp(request), day)}`);
  if (count > DAILY_LIMIT) return fail('daily_limit', 429);

  // 5. Forward to the provider (the audio only passes through; it isn't saved)
  const upstream = new FormData();
  upstream.append('file', audio, `dictation.${ext}`);
  upstream.append('model', provider.model);
  upstream.append('response_format', 'json');
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${provider.apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    return fail('provider_error', 502);
  }
  if (res.status === 429) return fail('provider_busy', 503);
  if (!res.ok) return fail('provider_error', 502);

  try {
    const data = (await res.json()) as { text?: unknown };
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    return json({ text: await tidyPunctuation(text) });
  } catch {
    return fail('provider_error', 502);
  }
}
