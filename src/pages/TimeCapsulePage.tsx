import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { LetterIcon } from '../components/icons';
import { formatLongDay, formatShortDay, todayKey } from '../lib/journal';
import {
  LETTER_TITLE_MAX,
  deleteLetter,
  listLetterSummaries,
  sealLetter,
  tomorrowKey,
  type LetterSummary,
} from '../lib/letters';

type Status = 'loading' | 'ready' | 'error';

export const letterTitle = (l: { title: string }) => l.title || 'Untitled letter';

export default function TimeCapsulePage() {
  const [status, setStatus] = useState<Status>('loading');
  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [unlockDate, setUnlockDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<LetterSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLetters(await listLetterSummaries());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const minDate = tomorrowKey();

  function resetForm() {
    setWriting(false);
    setTitle('');
    setBody('');
    setUnlockDate('');
    setError(null);
  }

  async function handleSeal(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError('Write a few words to your future self first.');
    if (!unlockDate) return setError('Pick the day this letter should open.');
    if (unlockDate < minDate) return setError('Pick a day after today.');
    setSaving(true);
    setError(null);
    try {
      const letter = await sealLetter({ title, body, unlockDate });
      resetForm();
      setMessage(`Sealed. It opens on ${formatLongDay(letter.unlockDate)}.`);
      await refresh();
    } catch {
      setError("Couldn't seal this letter. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteLetter(confirmDelete.id);
      setMessage('Letter deleted.');
      await refresh();
    } catch {
      setMessage("Couldn't delete this letter. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  return (
    <PageShell title="Time Capsule" subtitle="Letters to your future self." back={{ to: '/journal', label: 'Journal' }}>
      {writing ? (
        <form className="card letter-form" onSubmit={handleSeal} noValidate>
          <div className="field">
            <label htmlFor="letter-title">
              Title <span className="optional">(optional)</span>
            </label>
            <input
              id="letter-title"
              type="text"
              className="input"
              value={title}
              maxLength={LETTER_TITLE_MAX}
              placeholder="e.g. For the end of the semester"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="letter-body">Your letter</label>
            <textarea
              id="letter-body"
              className="input letter-body-input"
              value={body}
              placeholder="Dear future me…"
              onChange={(e) => {
                setBody(e.target.value);
                if (error) setError(null);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="letter-date">Opens on</label>
            <input
              id="letter-date"
              type="date"
              className="input letter-date-input"
              value={unlockDate}
              min={minDate}
              onChange={(e) => {
                setUnlockDate(e.target.value);
                if (error) setError(null);
              }}
            />
            <p className="hint">Once sealed, you won't be able to read or change it until then.</p>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Sealing…' : 'Seal letter'}
            </button>
            <button type="button" className="btn-secondary" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn-primary write-letter-btn"
          onClick={() => {
            setMessage('');
            setWriting(true);
          }}
        >
          Write a letter to future me
        </button>
      )}

      <p className="save-status" role="status">
        {message}
      </p>

      {status === 'loading' && <p className="hint">Loading…</p>}
      {status === 'error' && (
        <p className="form-error" role="alert">
          Couldn't read your letters on this device.
        </p>
      )}
      {status === 'ready' && letters.length === 0 && !writing && (
        <div className="card placeholder">Letters you write will wait here until their day.</div>
      )}
      {status === 'ready' && letters.length > 0 && (
        <ul className="letter-list">
          {letters.map((l) => {
            const statusLine = !l.ready
              ? `Opens on ${formatLongDay(l.unlockDate)}`
              : l.openedAt
                ? `Opened ${formatShortDay(todayKey(new Date(l.openedAt)))}`
                : 'Ready to open';
            const inner = (
              <>
                <span className={`letter-icon${l.ready ? ' ready' : ''}`} aria-hidden="true">
                  <LetterIcon />
                </span>
                <span className="letter-text">
                  <span className={`letter-title${l.title ? '' : ' untitled'}`}>{letterTitle(l)}</span>
                  <span className={`letter-status${l.ready && !l.openedAt ? ' ready' : ''}`}>{statusLine}</span>
                </span>
              </>
            );
            return (
              <li key={l.id} className="letter-row">
                {l.ready ? (
                  <Link to={`/journal/time-capsule/${l.id}`} className="letter-main">
                    {inner}
                    <span className="quick-action-arrow" aria-hidden="true">›</span>
                  </Link>
                ) : (
                  <div className="letter-main sealed">{inner}</div>
                )}
                <button
                  type="button"
                  className="letter-delete"
                  aria-label={`Delete ${letterTitle(l)}`}
                  onClick={() => setConfirmDelete(l)}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this letter?"
          message={`"${letterTitle(confirmDelete)}" will be removed from this device${
            confirmDelete.ready ? '' : ' without being opened'
          }. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </PageShell>
  );
}
