import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import { LIMITS, formatDay, formatTime, getTalkEntry, saveTalkEntry, todayKey, type TalkEntry } from '../lib/journal';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

export default function TalkEntryPage() {
  const { id } = useParams();
  const navigate = useNavigate();

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError('Write something to save this page.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTalkEntry({ title, body }, entry);
      setEntry(saved);
      setTitle(saved.title);
      setJustSaved(true);
      if (!id) navigate(`/journal/talk/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while saving.');
    } finally {
      setSaving(false);
    }
  }

  const subtitle = formatDay(entry?.date ?? todayKey());

  return (
    <PageShell title="Need to talk about it" subtitle={subtitle} back={{ to: '/journal', label: 'Journal' }}>
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

          {/* Reserved for a future feature. Placeholder only: no AI yet. */}
          <div className="talk-reserved">
            <button type="button" className="btn-talk" disabled aria-describedby="talk-soon">
              Talk about this
            </button>
            <p id="talk-soon" className="hint">
              Coming soon
            </p>
          </div>
        </form>
      )}
    </PageShell>
  );
}
