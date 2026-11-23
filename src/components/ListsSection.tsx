import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LIST_TITLE_MAX, createList, listLists, type UserList } from '../lib/lists';
import EmptyState from './EmptyState';
import { SeeMore, previewOf, useSectionAnchor } from './ListPreview';

type Status = 'loading' | 'ready' | 'error';

/** Ideas offered when starting a new list (each is a plain list you can check off). */
const IDEAS = ['Packing list', 'Gift ideas', 'Books to read', 'Movies to watch', 'Places to try'];

const countLabel = (l: UserList) => (l.items.length === 0 ? 'Empty' : `${l.items.length} ${l.items.length === 1 ? 'item' : 'items'}`);

/** The Lists area on My Life: every list (To do, Wishlist, Bucket list, Groceries and my own), and a way to start one. */
export default function ListsSection({ full = false }: { full?: boolean }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [lists, setLists] = useState<UserList[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  useSectionAnchor('lists', sectionRef);

  useEffect(() => {
    let active = true;
    listLists()
      .then((all) => {
        if (!active) return;
        setLists(all); // most recently used first
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

  function pick(idea: string) {
    setTitle(idea);
    setError(null);
    titleInput.current?.focus();
  }

  return (
    <section className="lists" aria-labelledby="lists-heading" ref={sectionRef}>
      <div className="goals-header">
        <h2 id="lists-heading" className={full ? 'sr-only' : 'section-title'}>
          Lists
        </h2>
        {!creating && (
          <button type="button" className="btn-secondary btn-small" onClick={() => setCreating(true)}>
            + New list
          </button>
        )}
      </div>
      {!full && <p className="hint habits-hint">Little collections, just for you.</p>}

      {creating && (
        <form className="card positive-form list-create" onSubmit={handleCreate} noValidate>
          <label htmlFor="new-list-title">List name</label>
          <input
            id="new-list-title"
            ref={titleInput}
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
          <div className="list-ideas">
            <span className="hint">Start from an idea:</span>
            <div className="list-idea-chips">
              {IDEAS.map((idea) => (
                <button key={idea} type="button" className={`measure-pill${title === idea ? ' active' : ''}`} onClick={() => pick(idea)}>
                  {idea}
                </button>
              ))}
              <button type="button" className={`measure-pill${title === '' ? ' active' : ''}`} onClick={() => pick('')}>
                Blank list
              </button>
            </div>
          </div>
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
        <EmptyState>No lists yet. Start one whenever you like.</EmptyState>
      )}
      {status === 'ready' && lists.length > 0 && (
        <ul className="list-index">
          {previewOf(lists, full).map((l) => (
            <li key={l.id}>
              <Link to={`/my-life/lists/${l.id}`} className="list-link">
                <span className="list-link-main">
                  <span className="list-link-title">{l.title}</span>
                  <span className="list-link-meta">{countLabel(l)}</span>
                </span>
                <span className="quick-action-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!full && lists.length > 3 && <SeeMore to="/my-life/lists" a11yLabel="See all your lists" />}
    </section>
  );
}
