import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MicIcon } from './icons';
import { AssistantError, askAssistant, translateLines, type AssistantMessage, type HeldEntry, type RecentItem } from '../lib/assistant';
import { applyUndo, type UndoSnapshot } from '../lib/undo';
import { notifyDataChanged } from '../lib/dataEvents';
import { getAssistantDay } from '../lib/assistantContext';
import { MAX_RECORDING_MS, canDictate, pickFormat, transcribe } from '../lib/dictation';
import { todayKey } from '../lib/journal';

/** The assistant lives on Daily Sprout only (every day view of it); null on every other page. */
export function mainPageName(pathname: string): string | null {
  return pathname === '/sprout' || pathname.startsWith('/sprout/') ? 'Daily Sprout' : null;
}

const TOAST_MS = 5000;
/** A question stays a little longer, so there's time to read it before answering. */
const QUESTION_MS = 8000;
/** A question is only "open" for a short while; after that the next recording starts fresh. */
const QUESTION_OPEN_MS = 3 * 60 * 1000;
/** Undo stays this long after the last toast of a recording has faded. */
const UNDO_AFTER_MS = 10_000;
/** Listening only stops by itself after this long without any speech (people pause to think). */
const SILENCE_MS = 3000;
/** …or after this long if nothing at all was said. */
const NO_SPEECH_MS = 15000;
/** "That" in a later recording can refer to what the last one added, for this long. */
const RECENT_MS = 30 * 60 * 1000;

type Toast = { id: number; text: string; question?: boolean };
type Phase = 'idle' | 'starting' | 'listening' | 'working';

/**
 * Ask Thrive, voice only: tap the mic to start listening, tap again to send. Everything asked is carried out,
 * and each result (or anything that couldn't be done, or a question) shows as a small toast that fades by itself.
 * Nothing is kept: the audio, the words and the toasts live only in memory and are gone once the toasts fade —
 * apart from an open question, which is remembered (in memory) just long enough for the next recording to answer it.
 */
export default function VoiceAssistant() {
  const { pathname } = useLocation();
  const page = mainPageName(pathname);
  const [supported] = useState(canDictate);
  const [phase, setPhase] = useState<Phase>('idle');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());
  // The question just asked (and the request it was about), so the next recording can answer it.
  // A note waiting for the day's mood travels with it, so the answer saves it.
  const pending = useRef<{ chat: AssistantMessage[]; at: number; held: HeldEntry | null } | null>(null);
  // Undo for the most recent recording only (memory only; a new recording replaces it).
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const undoTimer = useRef<number>();
  // What the most recent recording added or changed, so "that was two cookies" finds it.
  const recent = useRef<{ items: RecentItem[]; at: number }>({ items: [], at: 0 });
  // The language of the last recording, so "Undone" follows it too.
  const lastLang = useRef('en');

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const capTimer = useRef<number>();
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const hush = useRef<{ timer: number; ctx: AudioContext } | null>(null);

  /** Stops watching for silence. */
  function stopHush() {
    const h = hush.current;
    hush.current = null;
    if (!h) return;
    window.clearInterval(h.timer);
    void h.ctx.close().catch(() => undefined);
  }

  /**
   * Watches the microphone's loudness (never the words; nothing is kept) and stops listening only after about
   * 3 seconds of quiet following speech. If loudness can't be read on this device, it never stops by itself —
   * a tap always does.
   */
  function watchSilence(s: MediaStream) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      void ctx.resume().catch(() => undefined);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const began = Date.now();
      let floor = Infinity;
      let anySound = false;
      let spokeAt = 0;
      const timer = window.setInterval(() => {
        if (ctx.state !== 'running') return; // can't hear levels: leave it to the tap
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const level = Math.sqrt(sum / buf.length);
        if (level > 0) anySound = true;
        floor = Math.min(floor * 1.002 + 1e-5, Math.max(level, 1e-5)); // the room's quiet level, slowly adapting
        if (Date.now() - began < 500 || !anySound) return;
        if (level > Math.max(0.01, floor * 3)) spokeAt = Date.now();
        const quietFor = Date.now() - (spokeAt || began);
        if ((spokeAt && quietFor > SILENCE_MS) || (!spokeAt && quietFor > NO_SPEECH_MS)) {
          stopHush();
          stop();
        }
      }, 100);
      hush.current = { timer, ctx };
    } catch {
      stopHush(); // no auto-stop on this device; tapping still sends
    }
  }

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (lines: string[], question?: string | null) => {
      const fresh = lines.map((text) => ({ id: nextId.current++, text, question: !!question && text === question }));
      setToasts((t) => [...t, ...fresh]);
      for (const toast of fresh) timers.current.set(toast.id, window.setTimeout(() => dismiss(toast.id), toast.question ? QUESTION_MS : TOAST_MS));
    },
    [dismiss],
  );

  function releaseMic() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  // Leaving Daily Sprout: stop listening, drop any audio, cancel any request, forget everything.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(capTimer.current);
      request.current?.abort();
      const r = recorder.current;
      if (r && r.state !== 'inactive') {
        r.onstop = null;
        r.stop();
      }
      chunks.current = [];
      stopHush();
      releaseMic();
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
      window.clearTimeout(undoTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!page) {
      pending.current = null;
      setToasts([]);
      setUndo(null);
      recent.current = { items: [], at: 0 };
    }
  }, [page]);

  async function start() {
    setPhase('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      releaseMic();
      setPhase('idle');
      show(['I couldn’t use the microphone. Check that Thrive is allowed to use it.']);
      return;
    }
    let r: MediaRecorder;
    try {
      const mimeType = pickFormat();
      r = new MediaRecorder(stream.current, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    } catch {
      releaseMic();
      setPhase('idle');
      show(['I couldn’t start listening this time. Please try again.']);
      return;
    }
    chunks.current = [];
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    r.onstop = () => void finish(r.mimeType);
    recorder.current = r;
    r.start(1000);
    setPhase('listening');
    watchSilence(stream.current);
    capTimer.current = window.setTimeout(stop, MAX_RECORDING_MS);
  }

  function stop() {
    window.clearTimeout(capTimer.current);
    stopHush();
    const r = recorder.current;
    if (r && r.state !== 'inactive') r.stop(); // → finish()
  }

  async function finish(mimeType: string) {
    releaseMic();
    const audio = new Blob(chunks.current, { type: mimeType || chunks.current[0]?.type || 'audio/webm' });
    chunks.current = []; // no copy of the recording is kept
    recorder.current = null;
    if (!alive.current) return;
    if (audio.size === 0) {
      setPhase('idle');
      show(['I didn’t hear anything that time. Tap the mic and try again.']);
      return;
    }
    setPhase('working');
    const controller = new AbortController();
    request.current = controller;
    try {
      const words = (await transcribe(audio, controller.signal)).trim();
      if (!words) {
        show(['I didn’t catch any words that time. Tap the mic and try again.']);
        return;
      }
      // An open question? Then this recording is the answer to it.
      const fresh = pending.current && Date.now() - pending.current.at < QUESTION_OPEN_MS ? pending.current : null;
      const chat: AssistantMessage[] = [...(fresh?.chat ?? []), { role: 'user', content: words.slice(0, 1000) }];
      const recentItems = Date.now() - recent.current.at < RECENT_MS ? recent.current.items : [];
      const result = await askAssistant(page ?? 'Daily Sprout', getAssistantDay() ?? todayKey(), chat, controller.signal, fresh?.held ?? null, recentItems);
      if (result.recent) recent.current = { items: result.recent, at: Date.now() };
      lastLang.current = result.lang;
      // This recording's Undo replaces the last one; it stays until a while after the toasts have faded.
      window.clearTimeout(undoTimer.current);
      setUndo(result.undo);
      if (result.undo) {
        const longest = result.question ? QUESTION_MS : TOAST_MS;
        undoTimer.current = window.setTimeout(() => setUndo(null), longest + UNDO_AFTER_MS);
      }
      pending.current = result.question
        ? { chat: [...chat, { role: 'assistant', content: result.question }], at: Date.now(), held: result.held }
        : null;
      if (alive.current) show(result.lines, result.question);
    } catch (e) {
      if (controller.signal.aborted || !alive.current) return;
      show([
        e instanceof AssistantError
          ? e.message
          : e === 'daily_limit'
            ? 'That’s all the listening I can do today. Everything still works by hand.'
            : 'Something went wrong, so nothing was changed. Please try again.',
      ]);
    } finally {
      request.current = null;
      if (alive.current) setPhase('idle');
    }
  }

  async function undoLast() {
    const snapshot = undo;
    if (!snapshot) return;
    window.clearTimeout(undoTimer.current);
    setUndo(null);
    try {
      const { skipped } = await applyUndo(snapshot);
      recent.current = { items: [], at: 0 };
      pending.current = null;
      notifyDataChanged();
      setToasts([]);
      const line = skipped ? 'Undone. One part was changed by hand since, so it was left as it is.' : 'Undone';
      show(await translateLines([line], lastLang.current));
    } catch {
      show(['Couldn’t do: undo that just now. Please check the page.']);
    }
  }

  if (!page) return null;

  const listening = phase === 'listening';
  const label = listening ? 'Listening… tap when you’re done' : phase === 'working' ? 'Working on it…' : phase === 'starting' ? 'Starting…' : '';

  return (
    <>
      <ol className="assistant-toasts" aria-live="polite" aria-label="Ask Thrive">
        {toasts.map((t) => (
          <li key={t.id}>
            <button type="button" className={`assistant-toast${t.question ? ' question' : ''}`} onClick={() => dismiss(t.id)}>
              {t.text}
            </button>
          </li>
        ))}
        {undo && (
          <li>
            <button type="button" className="assistant-undo" onClick={() => void undoLast()} disabled={phase === 'working'}>
              Undo
            </button>
          </li>
        )}
      </ol>
      {supported && (
        <div className="assistant-dock">
          {label && (
            <span className="assistant-state" role="status">
              {label}
            </span>
          )}
          <button
            type="button"
            className={`assistant-fab${listening ? ' listening' : ''}${phase === 'working' ? ' working' : ''}`}
            aria-label={listening ? 'Stop and send' : 'Ask Thrive: tap and speak'}
            aria-pressed={listening}
            disabled={phase === 'starting' || phase === 'working'}
            onClick={() => (listening ? stop() : void start())}
          >
            <MicIcon />
          </button>
        </div>
      )}
    </>
  );
}
