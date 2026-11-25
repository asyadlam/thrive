import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import DictationButton from './DictationButton';
import { MicIcon } from './icons';
import { AssistantError, askAssistant, type AssistantMessage } from '../lib/assistant';
import { getAssistantDay } from '../lib/assistantContext';
import { todayKey } from '../lib/journal';

/** The assistant lives on Daily Sprout only (every day view of it); null on every other page. */
export function mainPageName(pathname: string): string | null {
  return pathname === '/sprout' || pathname.startsWith('/sprout/') ? 'Daily Sprout' : null;
}

const MESSAGE_MAX = 1000;

/**
 * The chat panel. Ephemeral by design: the conversation lives only in this component's memory. Closing the panel
 * unmounts it, so the whole chat (and any dictated text) is gone; only the changes it made to the app remain.
 */
function AssistantPanel({ page, onClose }: { page: string; onClose: () => void }) {
  const [chat, setChat] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      controller.current?.abort(); // closing mid-answer: nothing more happens
    };
  }, [onClose]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length, busy]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const next: AssistantMessage[] = [...chat, { role: 'user', content: text.slice(0, MESSAGE_MAX) }];
    setChat(next);
    setDraft('');
    setBusy(true);
    controller.current = new AbortController();
    try {
      const reply = await askAssistant(page, getAssistantDay() ?? todayKey(), next.slice(-20), controller.current.signal);
      setChat((c) => [...c, { role: 'assistant', content: reply }]);
    } catch (err) {
      if (controller.current?.signal.aborted) return;
      setChat((c) => [...c, { role: 'assistant', content: err instanceof AssistantError ? err.message : 'Something went wrong. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assistant-backdrop" onClick={onClose}>
      <div className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title" onClick={(e) => e.stopPropagation()}>
        <div className="assistant-head">
          <h2 id="assistant-title">Ask Thrive</h2>
          <button type="button" className="assistant-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="assistant-messages" ref={listRef} aria-live="polite">
          {chat.length === 0 && (
            <p className="assistant-intro">
              Tell me what to log or change, like “I drank three glasses of water” or “add call the dentist to tomorrow”. This chat isn’t saved.
            </p>
          )}
          {chat.map((m, i) => (
            <p key={i} className={`assistant-bubble ${m.role === 'user' ? 'from-me' : 'from-thrive'}`}>
              {m.content}
            </p>
          ))}
          {busy && <p className="assistant-bubble from-thrive assistant-typing">…</p>}
        </div>
        <form className="assistant-form" onSubmit={(e) => void send(e)}>
          <DictationButton value={draft} onChange={setDraft} maxLength={MESSAGE_MAX} label="your message">
            <label htmlFor="assistant-input" className="sr-only">
              Your message
            </label>
          </DictationButton>
          <div className="assistant-row">
            <textarea
              id="assistant-input"
              className="input assistant-input"
              rows={1}
              value={draft}
              maxLength={MESSAGE_MAX}
              placeholder="Type or tap the mic"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) void send(e as unknown as FormEvent);
              }}
            />
            <button type="submit" className="chat-send" disabled={!draft.trim() || busy} aria-label="Send">
              ›
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** The round sage mic button, fixed above the tab bar on Daily Sprout. */
export default function VoiceAssistant() {
  const { pathname } = useLocation();
  const page = mainPageName(pathname);
  const [open, setOpen] = useState(false);

  // Leaving the page closes the panel (and with it, the chat).
  useEffect(() => setOpen(false), [pathname]);

  if (!page) return null;
  return (
    <>
      {!open && (
        <button type="button" className="assistant-fab" aria-label="Ask Thrive (voice assistant)" onClick={() => setOpen(true)}>
          <MicIcon />
        </button>
      )}
      {open && <AssistantPanel page={page} onClose={() => setOpen(false)} />}
    </>
  );
}
