import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { POSITIVE_MAX, addStandalonePositive, listAllPositives, type PositiveItem } from '../lib/positives';
import { formatShortDay, todayKey } from '../lib/journal';

type Status = 'loading' | 'ready' | 'error';

/** "Sat, Nov 21", plus the year for earlier years. */
function positiveDate(key: string): string {
  const short = formatShortDay(key);
  return key.slice(0, 4) === todayKey().slice(0, 4) ? short : `${short}, ${key.slice(0, 4)}`;
}

function pickRandom(items: PositiveItem[], avoidKey?: string): PositiveItem | null {
  if (items.length === 0) return null;
  const pool = items.length > 1 && avoidKey ? items.filter((i) => i.key !== avoidKey) : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function PositivesSection() {
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<PositiveItem[]>([]);
  const [featured, setFeatured] = useState<PositiveItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async (keepFeatured?: PositiveItem | null) => {
    try {
      const all = await listAllPositives();
      setItems(all);
      setFeatured((current) => {
        const keep = keepFeatured ?? current;
        return keep && all.some((i) => i.key === keep.key) ? keep : pickRandom(all);
      });
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError('Write a few words about the good moment to save it.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addStandalonePositive(text);
      setText('');
      setAdding(false);
      setMessage('Saved. Thanks for noticing that.');
      await refresh();
    } catch {
      setError("Couldn't save this positive. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="positives" aria-labelledby="positives-heading">
      <h2 id="positives-heading" className="section-title">
        Positives
      </h2>

      <div className="card remember-card" aria-live="polite">
        <span className="remember-label">A positive to remember</span>
        {status === 'loading' ? (
          <p className="hint">Loading…</p>
        ) : featured ? (
          <>
            <p className="remember-text">{featured.text}</p>
            <span className="hint">{positiveDate(featured.date)}</span>
            {items.length > 1 && (
              <button
                type="button"
                className="btn-secondary btn-small remember-next"
                onClick={() => setFeatured((cur) => pickRandom(items, cur?.key))}
              >
                Show me another
              </button>
            )}
          </>
        ) : (
          <p className="remember-empty">Your good moments will collect here.</p>
        )}
      </div>

      <div className="positives-add">
        {adding ? (
          <form className="card positive-form" onSubmit={handleAdd} noValidate>
            <label htmlFor="new-positive">A good moment</label>
            <input
              id="new-positive"
              type="text"
              className="input"
              value={text}
              maxLength={POSITIVE_MAX}
              placeholder="e.g. The sun came out on my walk"
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
                {saving ? 'Saving…' : 'Save positive'}
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
            + Add a positive
          </button>
        )}
        <p className="save-status" role="status">
          {message}
        </p>
      </div>

      {status === 'error' && (
        <p className="form-error" role="alert">
          Couldn't read your positives on this device.
        </p>
      )}

      {status === 'ready' && items.length > 0 && (
        <ul className="positive-list" aria-label="All your positives, newest first">
          {items.map((item) => (
            <li key={item.key} className="positive-item">
              <span className="positive-text">{item.text}</span>
              <span className="positive-date">{positiveDate(item.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
