/*
  "Talk about this": talks to our own /api/talk function. The conversation lives only in memory on the
  chat page; nothing here saves it. Only a summary the person confirms is saved (see saveTalkSummary).
*/

import { formatLongDay, todayKey } from './journal';
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

/**
 * Saves the conversation as a plain text file, built right here on the device from the chat on screen.
 * Only happens when the person taps "Download transcript"; the app itself keeps no copy.
 */
export function downloadTranscript(entryTitle: string, messages: ChatMessage[]) {
  const day = todayKey();
  const lines = [
    'Thrive — Talk about this',
    formatLongDay(day),
    `Entry: ${entryTitle}`,
    '',
    ...messages.map((m) => `${m.role === 'user' ? 'You' : 'Companion'}: ${m.content}`),
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

export async function askCompanion(
  mode: TalkMode,
  entry: { title: string; body: string },
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ reply: string; crisis: boolean }> {
  let res: Response;
  try {
    res = await fetch('/api/talk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, entry, messages }),
      signal,
    });
  } catch {
    throw new TalkFailure('failed', 'no connection');
  }
  const data = (await res.json().catch(() => null)) as {
    reply?: unknown;
    crisis?: unknown;
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
  return { reply: data.reply.trim(), crisis: data.crisis === true };
}
