/*
  "Talk about this": talks to our own /api/talk function. The conversation lives only in memory on the
  chat page; nothing here saves it. Only a summary the person confirms is saved (see saveTalkSummary).
*/

import { formatLongDay, todayKey, type TalkSummary, type TranscriptLine } from './journal';
import { downloadFile } from './backup';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type TalkMode = 'open' | 'reply' | 'close' | 'summary';
export type TalkError = 'daily_limit' | 'failed';

/** Why a companion call failed. `detail` is the provider's status/code while debugging (never any text). */
export class TalkFailure extends Error {
  constructor(
    public code: TalkError,
    public detail = '',
  ) {
    super(code);
  }
}

/** The chat on screen, in the shape a saved summary keeps it (role + text, in order). */
export const toTranscript = (messages: ChatMessage[]): TranscriptLine[] =>
  messages.map((m) => ({ role: m.role, text: m.content }));

/**
 * Turns a saved summary's transcript into a plain text file, built here on the device, and hands it to the
 * browser's normal download. Named after the day of that talk: thrive-talk-YYYY-MM-DD.txt
 */
export function downloadTranscript(entryTitle: string, summary: TalkSummary) {
  if (!summary.transcript?.length) return;
  const day = todayKey(new Date(summary.createdAt));
  const lines = [
    'Thrive — Talk about this',
    formatLongDay(day),
    `Entry: ${entryTitle}`,
    '',
    ...summary.transcript.map((l) => `${l.role === 'user' ? 'You' : 'Companion'}: ${l.text}`),
    '',
  ];
  downloadFile(`thrive-talk-${day}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
}

/** A conversation wraps up at about this many messages. */
export const MAX_CHAT_MESSAGES = 40;

/** Same small safety net as the server: these words show the Get Help card straight away. */
const CRISIS =
  /\b(kill(ing)? my ?self|suicid\w*|end(ing)? (it all|my life)|take my (own )?life|don'?t want to (live|be alive|be here|wake up)|want(ing)? to die|better off dead|hurt(ing)? my ?self|self[- ]?harm\w*|cut(ting)? my ?self|no reason to live|can'?t go on)\b/i;
export const soundsLikeCrisis = (text: string) => CRISIS.test(text);

/* ---------- Varied openings ---------- */

/** Ways the companion can open a conversation about an entry with writing; one is picked at random each time. */
const OPENING_ANGLES = ['quote', 'react', 'detail', 'feeling', 'loudest'] as const;
type OpeningAngle = (typeof OPENING_ANGLES)[number];

// Remembered on this device only so openings don't repeat back to back. Never any chat text.
const LAST_ANGLE_KEY = 'thrive.talk.lastAngle';
const LAST_OPENER_KEY = 'thrive.talk.lastOpener';

function readKey(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function writeKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: openings may simply repeat once */
  }
}

/** What to send with an "open" request: a random angle (not the same as last time) + the last built-in opener. */
export function openingRequest(): { angle: OpeningAngle; avoidOpener: string } {
  const last = readKey(LAST_ANGLE_KEY);
  const options = OPENING_ANGLES.filter((a) => a !== last);
  return { angle: options[Math.floor(Math.random() * options.length)], avoidOpener: readKey(LAST_OPENER_KEY) };
}

/** Remembers how this conversation opened, so the next one opens differently. */
export function rememberOpening(sent: { angle: OpeningAngle }, reply: string, builtIn: boolean) {
  if (builtIn) writeKey(LAST_OPENER_KEY, reply);
  else writeKey(LAST_ANGLE_KEY, sent.angle);
}

export async function askCompanion(
  mode: TalkMode,
  entry: { title: string; body: string },
  messages: ChatMessage[],
  signal?: AbortSignal,
  opening?: { angle: OpeningAngle; avoidOpener: string },
  /** Companion memory notes included in this chat; and, for a summary, whether to suggest new notes. */
  memory?: { notes: string[]; proposeNotes?: boolean },
): Promise<{ reply: string; crisis: boolean; builtIn: boolean; notes: string[] }> {
  let res: Response;
  try {
    res = await fetch('/api/talk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode,
        entry,
        messages,
        ...(mode === 'open' && opening ? opening : {}),
        ...(memory?.notes.length ? { memories: memory.notes } : {}),
        ...(mode === 'summary' && memory?.proposeNotes ? { proposeNotes: true } : {}),
      }),
      signal,
    });
  } catch {
    throw new TalkFailure('failed', 'no connection');
  }
  const data = (await res.json().catch(() => null)) as {
    reply?: unknown;
    crisis?: unknown;
    builtIn?: unknown;
    notes?: unknown;
    error?: unknown;
    providerStatus?: unknown;
    providerCode?: unknown;
  } | null;
  if (!res.ok || !data) {
    const detail = [
      `server ${res.status}`,
      data?.error ? String(data.error) : 'no JSON (is the server function running?)',
      data?.providerStatus ? `provider ${String(data.providerStatus)}` : '',
      data?.providerCode ? String(data.providerCode) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    throw new TalkFailure(data?.error === 'daily_limit' ? 'daily_limit' : 'failed', detail);
  }
  if (typeof data.reply !== 'string' || !data.reply.trim()) throw new TalkFailure('failed', 'empty reply');
  const notes = Array.isArray(data.notes)
    ? data.notes.filter((n): n is string => typeof n === 'string' && !!n.trim()).slice(0, 2)
    : [];
  return { reply: data.reply.trim(), crisis: data.crisis === true, builtIn: data.builtIn === true, notes };
}
