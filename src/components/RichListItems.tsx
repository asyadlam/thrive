import { useState, type FormEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import EmptyState from './EmptyState';
import { formatShortDay, todayKey } from '../lib/journal';
import {
  LIST_ITEM_MAX,
  LIST_NOTE_MAX,
  LIST_PRICE_MAX,
  addItem,
  deleteItem,
  editItem,
  setItemDone,
  type ListItem,
  type UserList,
} from '../lib/lists';

/** The wording and fields for the two "dream" lists (everything else about them is the same). */
const COPY = {
  wishlist: {
    add: '+ Add a wish',
    nameLabel: 'What is it?',
    namePlaceholder: 'e.g. A cosy reading lamp',
    notePlaceholder: 'e.g. The one from the corner shop',
    nameMissing: 'What would you like? Give it a name.',
    added: 'Added to your wishlist.',
    done: 'Got it',
    doneArea: 'Got it 🎉',
    doneMessage: (n: string) => `Got it — ${n}! 🎉`,
    back: 'Moved back to your wishlist.',
    empty: 'Nothing on your wishlist yet. Dream a little.',
    confirmTitle: 'Delete this wish?',
    confirmMessage: (n: string) => `"${n}" will be removed from your wishlist.`,
    price: true,
  },
  bucket: {
    add: '+ Add a dream',
    nameLabel: 'One day I want to…',
    namePlaceholder: 'e.g. See the northern lights',
    notePlaceholder: 'e.g. Maybe Norway, in winter',
    nameMissing: 'What would you love to do? Give it a name.',
    added: 'Added to your bucket list.',
    done: 'Did it',
    doneArea: 'Done it ✨',
    doneMessage: (n: string) => `Did it — ${n}! ✨`,
    back: 'Moved back to your bucket list.',
    empty: "Your bucket list is empty. What's one thing you'd love to do someday?",
    confirmTitle: 'Delete this from your bucket list?',
    confirmMessage: (n: string) => `"${n}" will be removed from your bucket list.`,
    price: false,
  },
} as const;

const doneDay = (iso: string) => {
  const key = todayKey(new Date(iso));
  return key.slice(0, 4) === todayKey().slice(0, 4) ? formatShortDay(key) : `${formatShortDay(key)}, ${key.slice(0, 4)}`;
};

type Props = {
  list: UserList;
  kind: 'wishlist' | 'bucket';
  /** Saves a change and shows the saved list; resolves false if it couldn't be saved. */
  apply: (change: (l: UserList) => Promise<UserList>) => Promise<boolean>;
};

/** Wishlist / Bucket list items: name, optional note (and price), and "Got it" / "Did it" with the date. */
export default function RichListItems({ list, kind, apply }: Props) {
  const copy = COPY[kind];
  const [editing, setEditing] = useState<null | 'new' | string>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<ListItem | null>(null);
  const [busy, setBusy] = useState(false);

  // Still wanted / to do: newest first. Got / done: most recently got first.
  const open = list.items.filter((i) => !i.checked).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = list.items.filter((i) => i.checked).sort((a, b) => (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt));

  function start(next: null | 'new' | ListItem) {
    const item = next && next !== 'new' ? next : null;
    setEditing(next === null ? null : next === 'new' ? 'new' : next.id);
    setName(item?.text ?? '');
    setPrice(item?.price ?? '');
    setNote(item?.note ?? '');
    setError(null);
    setMessage('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(copy.nameMissing);
    setBusy(true);
    const draft = { text: name, note, ...(copy.price ? { price } : {}) };
    const existing = list.items.find((i) => i.id === editing);
    const ok = await apply((l) => (existing ? editItem(l, existing.id, draft) : addItem(l, draft)));
    setBusy(false);
    if (!ok) return setError("Couldn't save this on this device. Please try again.");
    setMessage(existing ? 'Saved.' : copy.added);
    setEditing(null);
  }

  async function mark(item: ListItem, value: boolean) {
    if (await apply((l) => setItemDone(l, item.id, value))) setMessage(value ? copy.doneMessage(item.text) : copy.back);
  }

  async function remove() {
    if (!confirm) return;
    setBusy(true);
    const ok = await apply((l) => deleteItem(l, confirm.id));
    setBusy(false);
    setConfirm(null);
    if (ok) {
      setEditing(null);
      setMessage('Deleted.');
    }
  }

  const form = (existing?: ListItem) => (
    <form className="card positive-form rich-form" onSubmit={save} noValidate>
      <div className="field">
        <label htmlFor="rich-name">{copy.nameLabel}</label>
        <input id="rich-name" className="input" value={name} maxLength={LIST_ITEM_MAX} placeholder={copy.namePlaceholder} autoFocus onChange={(e) => (setName(e.target.value), setError(null))} />
      </div>
      {copy.price && (
        <div className="field">
          <label htmlFor="rich-price">
            Price <span className="optional">(optional)</span>
          </label>
          <input id="rich-price" className="input wish-price-input" value={price} maxLength={LIST_PRICE_MAX} placeholder="e.g. $40" onChange={(e) => setPrice(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="rich-note">
          Note <span className="optional">(optional)</span>
        </label>
        <input id="rich-note" className="input" value={note} maxLength={LIST_NOTE_MAX} placeholder={copy.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {existing ? 'Save' : 'Add'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => start(null)}>
          Cancel
        </button>
      </div>
      {existing && (
        <div className="goal-extra-actions">
          <button type="button" className="btn-danger-outline" onClick={() => setConfirm(existing)}>
            Delete
          </button>
        </div>
      )}
    </form>
  );

  const details = (i: ListItem) => (
    <button type="button" className="wish-main" onClick={() => start(i)} aria-label={`Edit ${i.text}`}>
      <span className="wish-name">{i.text}</span>
      {i.note && <span className="wish-note">{i.note}</span>}
      {copy.price && i.price && <span className="wish-price">{i.price}</span>}
    </button>
  );

  return (
    <div className="rich-list">
      <div className="rich-list-top">
        <p className="save-status" role="status">
          {message}
        </p>
        {editing !== 'new' && (
          <button type="button" className="btn-secondary btn-small" onClick={() => start('new')}>
            {copy.add}
          </button>
        )}
      </div>

      {editing === 'new' && form()}
      {list.items.length === 0 && editing !== 'new' && <EmptyState>{copy.empty}</EmptyState>}

      {open.length > 0 && (
        <ul className="wish-list">
          {open.map((i) =>
            editing === i.id ? (
              <li key={i.id}>{form(i)}</li>
            ) : (
              <li key={i.id} className="wish-item">
                {details(i)}
                <button type="button" className="wish-got" onClick={() => void mark(i, true)}>
                  {copy.done}
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {done.length > 0 && (
        <div className="wish-got-area">
          <h3 className="saved-label">{copy.doneArea}</h3>
          <ul className="wish-list">
            {done.map((i) =>
              editing === i.id ? (
                <li key={i.id}>{form(i)}</li>
              ) : (
                <li key={i.id} className="wish-item done">
                  {details(i)}
                  <span className="wish-side">
                    {i.doneAt && <span className="wish-got-date">{doneDay(i.doneAt)}</span>}
                    <button type="button" className="wish-back" onClick={() => void mark(i, false)}>
                      Move back
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={copy.confirmTitle}
          message={copy.confirmMessage(confirm.text)}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
