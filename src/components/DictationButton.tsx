import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_RECORDING_MS, appendDictation, canDictate, pickFormat, transcribe, type DictationError } from '../lib/dictation';

type Props = {
  /** The field's current text: dictated words are added after it. */
  value: string;
  /** Called with the field's new text (what was there + the dictated words). */
  onChange: (next: string) => void;
  /** The field's character limit, if it has one. */
  maxLength?: number;
  /** What's being dictated into, for screen readers (e.g. "your note"). */
  label: string;
  /** The field's own label, shown on the same row as the mic (optional). */
  children?: ReactNode;
};

type Phase = 'idle' | 'starting' | 'recording' | 'writing';

const SORRY = 'Dictation didn’t work this time — typing still works!';

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A small mic button for a text field: tap to record, tap Stop, and the words are added to the field.
 * Hidden if the browser can't record. Never touches text that's already there.
 */
export default function DictationButton({ value, onChange, maxLength, label, children }: Props) {
  const [supported] = useState(canDictate);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState('');

  // Always append to the latest text, even if it was edited while we were transcribing.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timers = useRef<number[]>([]);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  function clearTimers() {
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
  }
  function releaseMic() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  // Leaving the page mid-recording: stop the mic, drop the audio, cancel any upload.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
      request.current?.abort();
      const r = recorder.current;
      if (r && r.state !== 'inactive') {
        r.onstop = null;
        r.stop();
      }
      chunks.current = [];
      releaseMic();
    };
  }, []);

  if (!supported) return <>{children}</>; // no recording in this browser: just the field's label, no mic

  function gentleFail(reason: DictationError | 'failed' = 'failed') {
    if (!mounted.current) return;
    setPhase('idle');
    setNote(reason === 'daily_limit' ? 'That’s all the dictation for today — typing still works!' : SORRY);
  }

  async function start() {
    setNote('');
    setPhase('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      releaseMic();
      gentleFail(); // permission denied or no microphone
      return;
    }
    if (!mounted.current) return releaseMic();

    let r: MediaRecorder;
    try {
      const mimeType = pickFormat();
      r = new MediaRecorder(stream.current, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    } catch {
      releaseMic();
      gentleFail();
      return;
    }
    chunks.current = [];
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    r.onstop = () => void finish(r.mimeType);
    r.onerror = () => {
      clearTimers();
      releaseMic();
      chunks.current = [];
      gentleFail();
    };
    recorder.current = r;
    r.start(1000);

    const began = Date.now();
    setElapsed(0);
    setPhase('recording');
    timers.current.push(window.setInterval(() => setElapsed(Date.now() - began), 250));
    timers.current.push(window.setTimeout(stop, MAX_RECORDING_MS)); // the 5-minute cap
  }

  function stop() {
    clearTimers();
    const r = recorder.current;
    if (r && r.state !== 'inactive') r.stop(); // → finish()
  }

  async function finish(mimeType: string) {
    releaseMic();
    const audio = new Blob(chunks.current, { type: mimeType || chunks.current[0]?.type || 'audio/webm' });
    chunks.current = []; // the app keeps no copy
    recorder.current = null;
    if (!mounted.current) return;
    if (audio.size === 0) return gentleFail();

    setPhase('writing');
    const controller = new AbortController();
    request.current = controller;
    try {
      const text = await transcribe(audio, controller.signal);
      if (!mounted.current) return;
      setPhase('idle');
      if (!text.trim()) {
        setNote('I didn’t catch any words that time.');
        return;
      }
      const { value: current, onChange: change } = latest.current;
      let next = appendDictation(current, text);
      if (maxLength && next.length > maxLength) {
        next = next.slice(0, maxLength);
        setNote('Some of it didn’t fit in this field.');
      }
      change(next);
    } catch (e) {
      gentleFail(e === 'daily_limit' ? 'daily_limit' : 'failed');
    } finally {
      request.current = null;
    }
  }

  const recording = phase === 'recording';
  const busy = phase === 'starting' || phase === 'writing';

  return (
    <div className="dictation">
      {children}
      <p className="dictation-status" role="status" aria-live="polite">
        {recording && (
          <span className="dictation-recording">
            <span className="dictation-dot" aria-hidden="true" />
            Recording… {clock(elapsed)}
          </span>
        )}
        {phase === 'writing' && <span className="dictation-writing">Writing that down…</span>}
        {phase === 'idle' && note && <span className="dictation-note">{note}</span>}
      </p>
      {recording ? (
        <button type="button" className="dictation-btn dictation-stop" onClick={stop} aria-label="Stop recording">
          <span className="dictation-stop-square" aria-hidden="true" />
          Stop
        </button>
      ) : (
        <button
          type="button"
          className="dictation-btn"
          onClick={start}
          disabled={busy}
          aria-label={`Dictate ${label}`}
          title="Dictate"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
            <path d="M12 17.5V21" />
          </svg>
        </button>
      )}
    </div>
  );
}
