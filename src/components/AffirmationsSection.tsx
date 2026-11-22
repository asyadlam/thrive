import { useCallback, useEffect, useState, type FormEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { useCrossFade } from './useCrossFade';
import {
  AFFIRMATION_MAX,
  addCustomAffirmation,
  builtInItems,
  deleteCustomAffirmation,
  listCustomAffirmations,
  type AffirmationItem,
  type CustomAffirmation,
} from '../lib/affirmations';

function pickRandom(items: AffirmationItem[], avoidKey?: string): AffirmationItem {
  const pool = items.length > 1 && avoidKey ? items.filter((i) => i.key !== avoidKey) : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function AffirmationsSection() {
  const [mine, setMine] = useState<CustomAffirmation[]>([]);
  const [shown, setShown] = useState<AffirmationItem>(() => pickRandom(builtInItems()));
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CustomAffirmation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fade = useCrossFade(shown, (a, b) => a.key === b.key && a.text === b.text);

  const pool = useCallback(
    (custom: CustomAffirmation[]): AffirmationItem[] => [
      ...builtInItems(),
      ...custom.map((a) => ({ key: a.id, text: a.text, mine: true })),
    ],
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const custom = await listCustomAffirmations();
      setMine(custom);
      return custom;
    } catch {
      setLoadFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    // Pick the first one from everything (built-in + mine) once mine have loaded.
    void refresh().then((custom) => custom && setShown(pickRandom(pool(custom))));
  }, [refresh, pool]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError('Write a few words to save your affirmation.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await addCustomAffirmation(text);
      setText('');
      setAdding(false);
      setMessage('Added to your affirmations.');
      await refresh();
      setShown({ key: saved.id, text: saved.text, mine: true });
    } catch {
      setError("Couldn't save this affirmation. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteCustomAffirmation(confirmDelete.id);
      const custom = (await refresh()) ?? [];
      if (shown.key === confirmDelete.id) setShown(pickRandom(pool(custom)));
      setMessage('Affirmation deleted.');
    } catch {
      setMessage("Couldn't delete this affirmation. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  return (
    <section className="affirmations" aria-labelledby="affirmations-heading">
      <h2 id="affirmations-heading" className="section-title">
        Affirmations
      </h2>

      <div className="card affirmation-card">
        <div className={`crossfade${fade.faded ? ' faded' : ''}`}>
          <p className="affirmation-text" aria-live="polite">
            {fade.shown.text}
          </p>
          {fade.shown.mine && <span className="affirmation-mine">One of yours</span>}
        </div>
        <button
          type="button"
          className="btn-secondary btn-small"
          onClick={() => setShown((cur) => pickRandom(pool(mine), cur.key))}
        >
          Another one
        </button>
      </div>

      <div className="affirmations-add">
        {adding ? (
          <form className="card positive-form" onSubmit={handleAdd} noValidate>
            <label htmlFor="new-affirmation">Your affirmation</label>
            <input
              id="new-affirmation"
              type="text"
              className="input"
              value={text}
              maxLength={AFFIRMATION_MAX}
              placeholder="e.g. I'm learning, and that's enough for today."
              autoFocus
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save affirmation'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => {
                  setAdding(false);
                  setText('');
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setMessage('');
              setAdding(true);
            }}
          >
            + Add your own
          </button>
        )}
        <p className="save-status" role="status">
          {message}
        </p>
      </div>

      {loadFailed && (
        <p className="form-error" role="alert">
          Couldn't read your affirmations on this device.
        </p>
      )}

      {mine.length > 0 && (
        <details className="goals-completed my-affirmations">
          <summary>Your affirmations</summary>
          <ul className="affirmation-list">
            {mine.map((a) => (
              <li key={a.id} className="affirmation-item">
                <span className="affirmation-item-text">{a.text}</span>
                <button
                  type="button"
                  className="letter-delete affirmation-delete"
                  aria-label={`Delete "${a.text}"`}
                  onClick={() => setConfirmDelete(a)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this affirmation?"
          message={`"${confirmDelete.text}" will be removed from your affirmations. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </section>
  );
}
