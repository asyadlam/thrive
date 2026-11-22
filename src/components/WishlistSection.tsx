import { useCallback, useEffect, useState, type FormEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import EmptyState from './EmptyState';
import { formatShortDay, todayKey } from '../lib/journal';
import {
  WISH_NAME_MAX,
  WISH_NOTE_MAX,
  WISH_PRICE_MAX,
  deleteWish,
  listWishlist,
  saveWish,
  setWishGot,
  type WishItem,
} from '../lib/profile';

const gotDay = (iso: string) => {
  const key = todayKey(new Date(iso));
  return key.slice(0, 4) === todayKey().slice(0, 4) ? formatShortDay(key) : `${formatShortDay(key)}, ${key.slice(0, 4)}`;
};

/** Wishlist: things I want; "Got it" moves one to the "Got it 🎉" area with the date (and it can go back). */
export default function WishlistSection() {
  const [list, setList] = useState<{ wanted: WishItem[]; got: WishItem[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<null | 'new' | string>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<WishItem | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList(await listWishlist());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  function open(next: null | 'new' | WishItem) {
    const item = next && next !== 'new' ? next : null;
    setEditing(next === null ? null : next === 'new' ? 'new' : next.id);
    setName(item?.name ?? '');
    setPrice(item?.price ?? '');
    setNote(item?.note ?? '');
    setError(null);
    setMessage('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('What would you like? Give it a name.');
    setBusy(true);
    try {
      const all = [...(list?.wanted ?? []), ...(list?.got ?? [])];
      const existing = all.find((w) => w.id === editing);
      await saveWish({ name, price, note }, existing);
      setMessage(existing ? 'Saved.' : 'Added to your wishlist.');
      setEditing(null);
      await refresh();
    } catch {
      setError("Couldn't save this on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function got(item: WishItem, value: boolean) {
    await setWishGot(item, value);
    setMessage(value ? `Got it — ${item.name}! 🎉` : 'Moved back to your wishlist.');
    await refresh();
  }

  async function remove() {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteWish(confirm.id);
      setEditing(null);
      setMessage('Deleted.');
      await refresh();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const form = (existing?: WishItem) => (
    <form className="card positive-form" onSubmit={save} noValidate>
      <div className="field">
        <label htmlFor="wish-name">What is it?</label>
        <input id="wish-name" className="input" value={name} maxLength={WISH_NAME_MAX} placeholder="e.g. A cosy reading lamp" autoFocus onChange={(e) => (setName(e.target.value), setError(null))} />
      </div>
      <div className="field">
        <label htmlFor="wish-price">
          Price <span className="optional">(optional)</span>
        </label>
        <input id="wish-price" className="input wish-price-input" value={price} maxLength={WISH_PRICE_MAX} placeholder="e.g. $40" onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="wish-note">
          Note <span className="optional">(optional)</span>
        </label>
        <input id="wish-note" className="input" value={note} maxLength={WISH_NOTE_MAX} placeholder="e.g. The one from the corner shop" onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {existing ? 'Save' : 'Add'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => open(null)}>
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

  const details = (w: WishItem) => (
    <button type="button" className="wish-main" onClick={() => open(w)} aria-label={`Edit ${w.name}`}>
      <span className="wish-name">{w.name}</span>
      {w.note && <span className="wish-note">{w.note}</span>}
      {w.price && <span className="wish-price">{w.price}</span>}
    </button>
  );

  return (
    <section className="wishlist" aria-labelledby="wishlist-heading">
      <div className="goals-header">
        <h2 id="wishlist-heading" className="section-title">
          Wishlist
        </h2>
        {editing !== 'new' && (
          <button type="button" className="btn-secondary btn-small" onClick={() => open('new')}>
            + Add a wish
          </button>
        )}
      </div>
      <p className="save-status" role="status">
        {message}
      </p>

      {editing === 'new' && form()}
      {failed && <p className="form-error" role="alert">Couldn't read your wishlist on this device.</p>}
      {list && list.wanted.length === 0 && list.got.length === 0 && editing !== 'new' && <EmptyState>Nothing on your wishlist yet. Dream a little.</EmptyState>}

      {list && list.wanted.length > 0 && (
        <ul className="wish-list">
          {list.wanted.map((w) =>
            editing === w.id ? (
              <li key={w.id}>{form(w)}</li>
            ) : (
              <li key={w.id} className="wish-item">
                {details(w)}
                <button type="button" className="wish-got" onClick={() => void got(w, true)}>
                  Got it
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {list && list.got.length > 0 && (
        <div className="wish-got-area">
          <h3 className="saved-label">Got it 🎉</h3>
          <ul className="wish-list">
            {list.got.map((w) =>
              editing === w.id ? (
                <li key={w.id}>{form(w)}</li>
              ) : (
                <li key={w.id} className="wish-item done">
                  {details(w)}
                  <span className="wish-side">
                    <span className="wish-got-date">{gotDay(w.gotAt!)}</span>
                    <button type="button" className="wish-back" onClick={() => void got(w, false)}>
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
          title="Delete this wish?"
          message={`"${confirm.name}" will be removed from your wishlist.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
