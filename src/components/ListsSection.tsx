import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LIST_TITLE_MAX, createList, listLists, type UserList } from '../lib/lists';

type Status = 'loading' | 'ready' | 'error';

/** The Lists area on My Life: my lists by title, and a way to start a new one. */
export default function ListsSection() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [lists, setLists] = useState<UserList[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listLists()
      .then((all) => {
        if (!active) return;
        setLists(all);
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give your list a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const list = await createList(title);
      navigate(`/my-life/lists/${list.id}`);
    } catch {
      setError("Couldn't create this list. Please try again.");
      setSaving(false);
    }
  }

  return (
    <section className="lists" aria-labelledby="lists-heading">
      <div className="goals-header">
        <h2 id="lists-heading" className="section-title">
          Lists
        </h2>
        {!creating && (
          <button type="button" className="btn-secondary btn-small" onClick={() => setCreating(true)}>
            + New list
          </button>
        )}
      </div>
      <p className="hint habits-hint">Little collections, just for you.</p>

      {creating && (
        <form className="card positive-form list-create" onSubmit={handleCreate} noValidate>
          <label htmlFor="new-list-title">List name</label>
          <input
            id="new-list-title"
            type="text"
            className="input"
            value={title}
            maxLength={LIST_TITLE_MAX}
            placeholder="e.g. Things that help me"
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value);
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
              {saving ? 'Creating…' : 'Create list'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => {
                setCreating(false);
                setTitle('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {status === 'loading' && <p className="hint">Loading…</p>}
      {status === 'error' && (
        <p className="form-error" role="alert">
          Couldn't read your lists on this device.
        </p>
      )}
      {status === 'ready' && lists.length === 0 && !creating && (
        <div className="card placeholder">No lists yet. Start one whenever you like.</div>
      )}
      {status === 'ready' && lists.length > 0 && (
        <ul className="list-index">
          {lists.map((l) => (
            <li key={l.id}>
              <Link to={`/my-life/lists/${l.id}`} className="list-link">
                <span className="list-link-title">{l.title}</span>
                <span className="quick-action-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
