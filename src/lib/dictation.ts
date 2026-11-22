/*
  Dictation helpers. The recording lives only in memory: it's sent once to /api/transcribe
  (our own server function), and nothing about it is saved by the app.
*/

export const MAX_RECORDING_MS = 5 * 60 * 1000; // one recording is at most 5 minutes

/** Recording formats to try, best first (Chrome/Firefox record webm/ogg, Safari records mp4). */
const FORMATS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

/** Can this browser record audio at all? If not, the mic button simply isn't shown. */
export function canDictate(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** The first format this browser can record, or '' to let the browser choose. */
export function pickFormat(): string {
  return FORMATS.find((f) => window.MediaRecorder.isTypeSupported?.(f)) ?? '';
}

/** Adds dictated words after what's already written, with a space or line break as needed. */
export function appendDictation(existing: string, dictated: string): string {
  const words = dictated.trim();
  if (!words) return existing;
  if (!existing.trim()) return existing + words;
  if (/\s$/.test(existing)) return existing + words;
  return `${existing} ${words}`;
}

export type DictationError = 'daily_limit' | 'failed';

/** Sends one recording to our server for transcription. Throws a DictationError code on failure. */
export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const ext = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', audio, `dictation.${ext}`);
  let res: Response;
  try {
    res = await fetch('/api/transcribe', { method: 'POST', body: form, signal });
  } catch {
    throw 'failed' satisfies DictationError;
  }
  const data = (await res.json().catch(() => null)) as { text?: unknown; error?: unknown } | null;
  if (!res.ok || !data) throw (data?.error === 'daily_limit' ? 'daily_limit' : 'failed') satisfies DictationError;
  if (typeof data.text !== 'string') throw 'failed' satisfies DictationError; // e.g. no server function running
  return data.text;
}
