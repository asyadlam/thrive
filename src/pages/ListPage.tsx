import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  LIST_ITEM_MAX,
  LIST_TITLE_MAX,
  addItem,
  clearChecked,
  deleteItem,
  deleteList,
  getList,
  kindOf,
  renameList,
  toggleItem,
  type UserList,
} from '../lib/lists';
import EmptyState from '../components/EmptyState';
import RichListItems from '../components/RichListItems';

type Status = 'loading' | 'ready' | 'missing' | 'error';

export default function ListPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [list, setList] = useState<UserList | null>(null);
  const [newItem, setNewItem] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState('');
  const addInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getList(id)
      .then((l) => {
        if (!active) return;
        setList(l ?? null);
        setStatus(l ? 'ready' : 'missing');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [id]);

  // Every change saves immediately; show the saved version.
  async function apply(change: (l: UserList) => Promise<UserList>): Promise<boolean> {
    if (!list) return false;
    try {
      setList(await change(list));
      setFailed('');
      return true;
    } catch {
      setFailed("Couldn't save that change. Please try again.");
      return false;
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) {
      setItemError('Type something to add.');
      return;
    }
    const text = newItem;
    setNewItem('');
    setItemError(null);
    await apply((l) => addItem(l, text));
    addInput.current?.focus(); // ready for the next one
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError('Give your list a name.');
      return;
    }
    await apply((l) => renameList(l, title));
    setRenaming(false);
  }

  async function handleDeleteList() {
    setDeleting(true);
    try {
      await deleteList(id);
      navigate('/my-life', { replace: true });
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
      setFailed("Couldn't delete this list. Please try again.");
    }
  }

  const back = { to: '/my-life?section=lists', label: 'My Life' };
  const kind = list ? kindOf(list) : 'custom';
  const rich = kind === 'wishlist' || kind === 'bucket';
  // Checked items sink to the bottom (each group keeps the order the items were added in).
  const ordered = list ? [...list.items.filter((i) => !i.checked), ...list.items.filter((i) => i.checked)] : [];
  const checkedCount = ordered.filter((i) => i.checked).length;

  if (status !== 'ready' || !list) {
    return (
      <PageShell title="List" subtitle="" back={back}>
        <div className={`card ${status === 'error' ? 'form-error' : 'placeholder'}`} role={status === 'error' ? 'alert' : undefined}>
          {status === 'loading'
            ? 'Loading…'
            : status === 'missing'
              ? "This list isn't on this device anymore."
              : "Couldn't read this list on this device."}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={list.title} subtitle="Just for you." back={back}>
      {renaming ? (
        <form className="card positive-form list-rename" onSubmit={handleRename} noValidate>
          <label htmlFor="list-title">List name</label>
          <input
            id="list-title"
            type="text"
            className="input"
            value={title}
            maxLength={LIST_TITLE_MAX}
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError(null);
            }}
          />
          {titleError && (
            <p className="form-error" role="alert">
              {titleError}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              Save name
            </button>
            <button type="button" className="btn-secondary" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="list-actions">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => {
              setTitle(list.title);
              setTitleError(null);
              setRenaming(true);
            }}
          >
            Rename
          </button>
          <button type="button" className="btn-danger-outline btn-small" onClick={() => setConfirmDelete(true)}>
            Delete list
          </button>
        </div>
      )}

      {rich && list && <RichListItems list={list} kind={kind as 'wishlist' | 'bucket'} apply={apply} />}

      {!rich && (
      <form className="list-add" onSubmit={handleAdd} noValidate>
        <label htmlFor="new-item" className="sr-only">
          Add an item
        </label>
        <input
          id="new-item"
          ref={addInput}
          type="text"
          className="input"
          value={newItem}
          maxLength={LIST_ITEM_MAX}
          placeholder="Add an item"
          onChange={(e) => {
            setNewItem(e.target.value);
            if (itemError) setItemError(null);
          }}
        />
        <button type="submit" className="btn-primary list-add-btn">
          Add
        </button>
      </form>
      )}
      {itemError && (
        <p className="form-error" role="alert">
          {itemError}
        </p>
      )}
      {failed && (
        <p className="form-error" role="alert">
          {failed}
        </p>
      )}

      {rich ? null : list.items.length === 0 ? (
        <EmptyState>Nothing here yet. Add the first item above.</EmptyState>
      ) : (
        <ul className="list-items">
          {ordered.map((item) => (
            <li key={item.id} className={`list-item${item.checked ? ' checked' : ''}`}>
              <label className="list-item-main">
                <input type="checkbox" checked={item.checked} onChange={() => apply((l) => toggleItem(l, item.id))} />
                <span className="list-check" aria-hidden="true">
                  {item.checked ? '✓' : ''}
                </span>
                <span className="list-item-text">{item.text}</span>
              </label>
              <button
                type="button"
                className="list-item-delete"
                aria-label={`Delete "${item.text}"`}
                onClick={() => apply((l) => deleteItem(l, item.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {!rich && checkedCount > 0 && (
        <div className="list-clear">
          <button type="button" className="list-clear-link" onClick={() => setConfirmClear(true)}>
            Clear checked
          </button>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear checked items?"
          message={`${checkedCount === 1 ? 'The 1 checked item' : `The ${checkedCount} checked items`} will be removed from "${list.title}". Unchecked items stay as they are.`}
          confirmLabel="Clear"
          onConfirm={() => {
            setConfirmClear(false);
            void apply((l) => clearChecked(l));
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this list?"
          message={`"${list.title}" and everything in it will be removed from this device. This can't be undone.`}
          confirmLabel="Delete list"
          busy={deleting}
          onConfirm={handleDeleteList}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </PageShell>
  );
}
