import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import { LIMITS, formatDay, formatTime, getTalkEntry, saveTalkEntry, todayKey, type TalkEntry } from '../lib/journal';
import DictationButton from '../components/DictationButton';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

export default function TalkEntryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const back = from ? { to: from, label: 'Back' } : { to: '/journal', label: 'Journal' };

  const [status, setStatus] = useState<Status>(id ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState('');
  const [entry, setEntry] = useState<TalkEntry | undefined>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!id || entry?.id === id) return; // new page, or the entry we just saved
    let active = true;
    setStatus('loading');
    getTalkEntry(id)
      .then((saved) => {
        if (!active) return;
        if (!saved) {
          setStatus('not-found');
          return;
        }
        setEntry(saved);
        setTitle(saved.title);
        setBody(saved.body);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Could not open on-device storage.');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [id, entry?.id]);

  const dirty = title !== (entry?.title ?? '') || body !== (entry?.body ?? '');

  /** Saves the page; returns the saved entry, or null if it couldn't be saved. */
  async function persist(): Promise<TalkEntry | null> {
    if (!body.trim()) {
      setError('Write something to save this page.');
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTalkEntry({ title, body }, entry);
      setEntry(saved);
      setTitle(saved.title);
      setJustSaved(true);
      if (!id) navigate(`/journal/talk/${saved.id}`, { replace: true, state: from ? { from } : null });
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while saving.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await persist();
  }

  /** "Talk about this": a blank page goes straight to a friendly chat; written words are saved first. */
  async function talk() {
    const chatState = from ? { from } : null;
    if (!body.trim()) {
      navigate('/journal/chat', { state: chatState });
      return;
    }
    const saved = entry && !dirty ? entry : await persist();
    if (saved) navigate(`/journal/chat/${saved.id}`, { state: chatState });
  }

  const subtitle = formatDay(entry?.date ?? todayKey());

  return (
    <PageShell title="Need to talk about it" subtitle={subtitle} back={back}>
      {status === 'loading' && <div className="card placeholder">Loading…</div>}

      {status === 'not-found' && <div className="card placeholder">This journal page couldn't be found on this device.</div>}

      {status === 'error' && (
        <div className="card form-error" role="alert">
          {loadError} Journal entries can't be saved in this browser right now.
        </div>
      )}

      {status === 'ready' && (
        <form className="card talk-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="talk-title" className="talk-title-label">
              Title <span className="optional">(optional)</span>
            </label>
            <input
              id="talk-title"
              type="text"
              className="input input-small"
              value={title}
              maxLength={LIMITS.title}
              placeholder="Give it a name, if you like"
              onChange={(e) => {
                setTitle(e.target.value);
                setJustSaved(false);
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="talk-body" className="sr-only">
              What's on your mind
            </label>
            <DictationButton
              value={body}
              onChange={(next) => {
                setBody(next);
                setJustSaved(false);
                if (error) setError(null);
              }}
              label="what's on your mind"
            />
            <textarea
              id="talk-body"
              className="input talk-body"
              value={body}
              placeholder="Write freely. There's no limit and no wrong way to do this."
              onChange={(e) => {
                setBody(e.target.value);
                setJustSaved(false);
                if (error) setError(null);
              }}
            />
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="talk-save-row">
            <p className="save-status talk-status" role="status">
              {justSaved && !dirty
                ? 'Saved on this device.'
                : entry && !dirty
                  ? `Last saved at ${formatTime(entry.updatedAt)}`
                  : ''}
            </p>
            <button type="submit" className="btn-primary" disabled={saving || (!!entry && !dirty)}>
              {saving ? 'Saving…' : entry ? 'Save changes' : 'Save'}
            </button>
          </div>

          <div className="talk-reserved">
            <button type="button" className="btn-talk" onClick={() => void talk()} disabled={saving} aria-describedby="talk-about-hint">
              Talk about this
            </button>
            <p id="talk-about-hint" className="hint">
              {body.trim() && (!entry || dirty)
                ? 'Talk it through with your companion. This page is saved first.'
                : 'Talk it through with your companion.'}
            </p>
          </div>
        </form>
      )}

      {status === 'ready' && entry?.talkSummary && (
        <section className="card talk-summary-card" aria-label="From your talk">
          <span className="saved-label">From your talk</span>
          <p>{entry.talkSummary}</p>
        </section>
      )}
    </PageShell>
  );
}
