import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { PET_ART } from '../components/PetCompanion';
import { getTalkEntry, saveTalkSummary, talkEntryLabel, type TalkEntry } from '../lib/journal';
import { loadSettings } from '../lib/settings';
import {
  MAX_CHAT_MESSAGES,
  TalkFailure,
  askCompanion,
  downloadTranscript,
  soundsLikeCrisis,
  type ChatMessage,
  type TalkMode,
} from '../lib/talk';

/** One chat bubble. `crisis` shows the Get Help card under it. Kept only in memory, never saved. */
type Bubble = ChatMessage & { crisis?: boolean };
type Phase = 'loading' | 'missing' | 'consent' | 'chatting' | 'ended';
type Summary =
  | { state: 'idle' }
  | { state: 'writing' }
  | { state: 'shown'; text: string }
  | { state: 'saving'; text: string }
  | { state: 'saved' }
  | { state: 'declined' };

const CONSENT =
  'The companion will read only this entry to talk it through with you. The text of this entry is sent to our AI provider (Groq) for this conversation. The chat itself isn’t saved unless you choose to save a summary.';

/** Shown if the companion can't send its goodbye: ending always works from your side. */
const LOCAL_CLOSING = 'Thank you for talking it through. Be gentle with yourself — and here’s to a softer tomorrow.';

function sorry(e: unknown): string {
  return e instanceof TalkFailure && e.code === 'daily_limit'
    ? 'That’s all the talking for today. Your entry is safe, and the companion will be here tomorrow.'
    : 'I couldn’t reply just now. Your words are still here — try again in a moment.';
}

/** While debugging: what went wrong, in short (status codes only, never any of your words). */
const debugDetail = (e: unknown) => (e instanceof TalkFailure && e.detail ? e.detail : '');

/** "Talk about this": a calm chat about one journal page. Leaving the page discards the chat. */
export default function TalkChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [{ companion }] = useState(loadSettings);
  const petSrc = companion === 'none' ? null : PET_ART[companion].src;

  const [phase, setPhase] = useState<Phase>(id ? 'loading' : 'consent');
  const [entry, setEntry] = useState<TalkEntry | null>(null);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [problem, setProblem] = useState<{ text: string; retry: TalkMode | null; detail?: string } | null>(null);
  const [summary, setSummary] = useState<Summary>({ state: 'idle' });

  const request = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // A saved page is read from this device; a blank new page has no entry yet.
  useEffect(() => {
    if (!id) return;
    let active = true;
    getTalkEntry(id)
      .then((e) => {
        if (!active) return;
        if (!e) return setPhase('missing');
        setEntry(e);
        setPhase('consent');
      })
      .catch(() => active && setPhase('missing'));
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => () => request.current?.abort(), []);

  // Keep the newest message in view.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, waiting, phase, summary.state]);

  const backTo = id ? `/journal/talk/${id}` : '/journal/talk';
  const backState = (location.state as { from?: string } | null)?.from ? { from: (location.state as { from: string }).from } : null;
  const entryText = { title: entry?.title ?? '', body: entry?.body ?? '' };
  const toApi = (list: Bubble[]): ChatMessage[] => list.map(({ role, content }) => ({ role, content }));

  async function ask(mode: TalkMode, history: Bubble[]) {
    setWaiting(true);
    setProblem(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const { reply, crisis } = await askCompanion(mode, entryText, toApi(history), controller.signal);
      const lastUser = [...history].reverse().find((m) => m.role === 'user');
      const showHelp = mode !== 'open' && (crisis || (!!lastUser && soundsLikeCrisis(lastUser.content)));
      setMessages([...history, { role: 'assistant', content: reply, crisis: showHelp }]);
      if (mode === 'close') setPhase('ended');
    } catch (e) {
      if (controller.signal.aborted) return;
      const lastUser = [...history].reverse().find((m) => m.role === 'user');
      const crisis = !!lastUser && soundsLikeCrisis(lastUser.content);
      if (mode === 'close') {
        // Ending never depends on the server: close with a built-in goodbye and carry on.
        setMessages([...history, { role: 'assistant', content: LOCAL_CLOSING, crisis }]);
        setPhase('ended');
        setProblem({ text: '', retry: null, detail: debugDetail(e) });
        return;
      }
      // Even if the companion can't answer, someone in crisis still sees where to get help.
      if (crisis) setMessages(history.map((m) => (m === lastUser ? { ...m, crisis: true } : m)));
      const limit = e instanceof TalkFailure && e.code === 'daily_limit';
      setProblem({ text: sorry(e), retry: limit ? null : mode, detail: debugDetail(e) });
    } finally {
      // Only the newest request may clear the "waiting" state (End can replace a slow reply).
      if (request.current === controller) {
        setWaiting(false);
        request.current = null;
      }
    }
  }

  function start() {
    setPhase('chatting');
    void ask('open', []);
  }

  function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || waiting || phase !== 'chatting') return;
    const history: Bubble[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setDraft('');
    // At about 40 messages the companion wraps up kindly instead of carrying on.
    void ask(history.length + 1 >= MAX_CHAT_MESSAGES ? 'close' : 'reply', history);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on a keyboard; Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  /** Always works: stops a reply that's still on its way, then says goodbye (locally if it has to). */
  function end() {
    request.current?.abort();
    if (messages.length === 0) return navigate(backTo, { state: backState });
    void ask('close', messages);
  }

  async function writeSummary() {
    setSummary({ state: 'writing' });
    try {
      const { reply } = await askCompanion('summary', entryText, toApi(messages));
      setSummary({ state: 'shown', text: reply });
    } catch (e) {
      setSummary({ state: 'idle' });
      setProblem({
        text: 'The summary couldn’t be written just now. You can try again, or simply head back — nothing is lost.',
        retry: null,
        detail: debugDetail(e),
      });
    }
  }

  async function keepSummary(text: string) {
    if (!id) return;
    setSummary({ state: 'saving', text });
    try {
      await saveTalkSummary(id, text);
      setSummary({ state: 'saved' });
    } catch {
      setSummary({ state: 'shown', text });
      setProblem({ text: 'Couldn’t save the summary on this device. Please try again.', retry: null });
    }
  }

  const title = entry ? talkEntryLabel(entry) : 'A blank page';

  return (
    <PageShell title="Talk about this" subtitle={title} back={{ to: backTo, label: 'Back to your entry' }}>
      {phase === 'loading' && <div className="card placeholder">Loading…</div>}
      {phase === 'missing' && <div className="card placeholder">This journal page couldn't be found on this device.</div>}

      {phase === 'consent' && (
        <ConfirmDialog
          title="Talk about this entry?"
          message={CONSENT}
          confirmLabel="Start talking"
          cancelLabel="Not now"
          tone="gentle"
          onConfirm={start}
          onCancel={() => navigate(backTo, { replace: true, state: backState })}
        />
      )}

      {(phase === 'chatting' || phase === 'ended') && (
        <div className="chat">
          <div className="chat-top">
            <p className="chat-note">This chat isn’t saved.</p>
            {messages.length > 0 && (
              <button type="button" className="btn-secondary btn-small" onClick={() => downloadTranscript(title, toApi(messages))}>
                Download transcript
              </button>
            )}
          </div>

          <ol className="chat-list" aria-live="polite" aria-label="Conversation">
            {messages.map((m, i) => (
              <li key={i} className={`chat-row ${m.role === 'user' ? 'from-me' : 'from-companion'}`}>
                {m.role === 'assistant' &&
                  (petSrc ? (
                    <img className="chat-pet" src={petSrc} alt="" width={36} height={36} />
                  ) : (
                    <span className="chat-pet chat-pet-none" aria-hidden="true" />
                  ))}
                <div className="chat-bubble">
                  <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Companion: '}</span>
                  {m.content}
                </div>
                {m.crisis && (
                  <div className="chat-help" role="note">
                    <p>You deserve support right now. Please reach out to someone you trust, or get help today.</p>
                    <p className="hint">
                      In the US you can call or text 988 at any time. If you’re in immediate danger, call 911 or your local
                      emergency number.
                    </p>
                    <Link to="/help" className="chat-help-link">
                      Open Get Help
                    </Link>
                  </div>
                )}
              </li>
            ))}
            {waiting && (
              <li className="chat-row from-companion">
                {petSrc ? <img className="chat-pet" src={petSrc} alt="" width={36} height={36} /> : <span className="chat-pet chat-pet-none" aria-hidden="true" />}
                <div className="chat-bubble chat-typing" aria-label="The companion is writing">
                  <span />
                  <span />
                  <span />
                </div>
              </li>
            )}
          </ol>

          {problem && (problem.text || problem.detail) && (
            <div className="chat-problem" role="status">
              {problem.text && <span>{problem.text}</span>}
              {problem.detail && <small className="chat-debug">Details for debugging: {problem.detail}</small>}
              {problem.retry && (
                <button type="button" className="btn-secondary btn-small" onClick={() => void ask(problem.retry!, messages)}>
                  Try again
                </button>
              )}
            </div>
          )}

          {phase === 'chatting' && (
            <form className="chat-composer" onSubmit={send}>
              <label htmlFor="chat-input" className="sr-only">
                Your message
              </label>
              <textarea
                id="chat-input"
                className="input chat-input"
                rows={1}
                value={draft}
                maxLength={2000}
                placeholder="Write a reply…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button type="submit" className="chat-send" disabled={!draft.trim() || waiting} aria-label="Send">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          )}
          {phase === 'chatting' && (
            <button type="button" className="btn-secondary chat-end" onClick={end}>
              End conversation
            </button>
          )}

          {phase === 'ended' && (
            <div className="chat-after">
              {id && summary.state === 'idle' && (
                <button type="button" className="btn-primary" onClick={() => void writeSummary()}>
                  Save a short summary to this entry
                </button>
              )}
              {summary.state === 'writing' && <p className="hint">Writing a short summary…</p>}
              {(summary.state === 'shown' || summary.state === 'saving') && (
                <div className="card chat-summary">
                  <span className="saved-label">Your summary</span>
                  <p>{summary.text}</p>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={summary.state === 'saving'}
                      onClick={() => void keepSummary(summary.text)}
                    >
                      {summary.state === 'saving' ? 'Saving…' : 'Save to this entry'}
                    </button>
                    <button type="button" className="btn-secondary" disabled={summary.state === 'saving'} onClick={() => setSummary({ state: 'declined' })}>
                      Not now
                    </button>
                  </div>
                </div>
              )}
              {summary.state === 'saved' && <p className="save-status">Saved to your entry, under “From your talk”.</p>}
              {!id && <p className="hint">This page wasn’t saved, so there’s nowhere to keep a summary this time.</p>}
              <button type="button" className="btn-secondary chat-back" onClick={() => downloadTranscript(title, toApi(messages))}>
                Download transcript
              </button>
              <Link to={backTo} state={backState} className="btn-secondary chat-back">
                Back to your entry
              </Link>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}
    </PageShell>
  );
}
