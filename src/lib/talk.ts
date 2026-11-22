/*
  "Talk about this": talks to our own /api/talk function. The conversation lives only in memory on the
  chat page; nothing here saves it. Only a summary the person confirms is saved (see saveTalkSummary).
*/

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type TalkMode = 'open' | 'reply' | 'close' | 'summary';
export type TalkError = 'daily_limit' | 'failed';

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
    throw 'failed' satisfies TalkError;
  }
  const data = (await res.json().catch(() => null)) as { reply?: unknown; crisis?: unknown; error?: unknown } | null;
  if (!res.ok || !data) throw (data?.error === 'daily_limit' ? 'daily_limit' : 'failed') satisfies TalkError;
  if (typeof data.reply !== 'string' || !data.reply.trim()) throw 'failed' satisfies TalkError;
  return { reply: data.reply.trim(), crisis: data.crisis === true };
}
