import { useState, type FormEvent } from 'react';
import { SAVE_FAILED } from '../lib/messages';
import ConfirmDialog from './ConfirmDialog';
import EmptyState from './EmptyState';
import { formatShortDay, todayKey } from '../lib/journal';
import {
  LIST_ITEM_MAX,
  LIST_NOTE_MAX,
  LIST_PRICE_MAX,
  addItem,
  addSaved,
  deleteItem,
  dollars,
  editItem,
  priceAmount,
  resetSaved,
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
    priceLabel: 'Price',
    pricePlaceholder: 'e.g. $40',
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
    price: true, // a bucket list item's optional cost
    priceLabel: 'Cost',
    pricePlaceholder: 'e.g. $1,200',
  },
} as const;

const doneDay = (iso: string) => {
  const key = todayKey(new Date(iso));
  return key.slice(0, 4) === todayKey().slice(0, 4) ? formatShortDay(key) : `${formatShortDay(key)}, ${key.slice(0, 4)}`;
};

/** "15", "$15", "15.50", "15,5" → dollars; null if it isn't a sensible amount. */
function readAmount(text: string): number | null {
  const n = Number(text.trim().replace(/^\$/, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

/**
 * The wishlist as plain text to send: "My wishlist 🎁", then one line per item not yet got —
 * "Cozy sweater, $45 (the green one)". Only text; no link, nothing about the app or this device.
 */
export function wishlistText(items: ListItem[]): string | null {
  const wanted = items.filter((i) => !i.checked).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (wanted.length === 0) return null;
  const line = (i: ListItem) => `${i.text}${i.price ? `, ${i.price}` : ''}${i.note ? ` (${i.note})` : ''}`;
  return ['My wishlist 🎁', ...wanted.map(line)].join('\n');
}

/** Copies text, with an older-browser fallback. Resolves false if nothing worked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

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
  // Savings: which item's "Add money" box is open, and what's typed in it.
  const [moneyFor, setMoneyFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<ListItem | null>(null);

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
    if (!ok) return setError(SAVE_FAILED);
    setMessage(existing ? 'Saved.' : copy.added);
    setEditing(null);
  }

  async function mark(item: ListItem, value: boolean) {
    if (await apply((l) => setItemDone(l, item.id, value))) setMessage(value ? copy.doneMessage(item.text) : copy.back);
  }

  function openMoney(item: ListItem) {
    setMoneyFor((cur) => (cur === item.id ? null : item.id));
    setAmount('');
    setMoneyError(null);
    setMessage('');
  }

  /** Adds (or, with `sign` -1, takes out) the typed amount. */
  async function changeSaved(e: FormEvent | null, item: ListItem, sign: 1 | -1) {
    e?.preventDefault();
    const n = readAmount(amount);
    if (n === null) return setMoneyError('Type an amount in dollars, like 15 or 15.50.');
    const ok = await apply((l) => addSaved(l, item.id, sign * n));
    if (!ok) return setMoneyError("Couldn't save this on this device. Please try again.");
    setAmount('');
    setMoneyError(null);
    setMoneyFor(null);
    setMessage(sign > 0 ? `Added ${dollars(n)} to ${item.text}.` : `Took ${dollars(n)} out of ${item.text}.`);
  }

  async function reset() {
    if (!confirmReset) return;
    const item = confirmReset;
    setConfirmReset(null);
    if (await apply((l) => resetSaved(l, item.id))) {
      setMoneyFor(null);
      setMessage(`${item.text} is back to $0 saved.`);
    }
  }

  /** Share sheet if the device has one; otherwise copy to the clipboard. */
  async function share() {
    const text = wishlistText(list.items);
    if (!text) return setMessage('Nothing to share yet.');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // closed the share sheet: nothing to do
        // anything else: fall back to copying
      }
    }
    setMessage((await copyText(text)) ? 'Copied — paste it wherever you like.' : "Couldn't copy your wishlist on this device.");
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
            {copy.priceLabel} <span className="optional">(optional)</span>
          </label>
          <input id="rich-price" className="input wish-price-input" value={price} maxLength={LIST_PRICE_MAX} placeholder={copy.pricePlaceholder} onChange={(e) => setPrice(e.target.value)} />
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

  /** Saved so far against the price, a slim bar, and "Add money" (only for items with a price). */
  const savings = (i: ListItem) => {
    const target = priceAmount(i.price);
    if (target === null) return null;
    const saved = i.saved ?? 0;
    const ready = saved >= target;
    const pct = Math.min(100, Math.round((saved / target) * 100));
    const isOpen = moneyFor === i.id;
    return (
      <div className={`saving${ready ? ' ready' : ''}`}>
        <div className="saving-line">
          <span className="saving-amount">
            Saved {dollars(saved)} <span className="saving-of">of {dollars(target)}</span>
          </span>
          {ready && <span className="saving-ready">You can get it now</span>}
        </div>
        <div
          className="saving-bar"
          role="progressbar"
          aria-label={`Saved for ${i.text}`}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(saved, target)}
          aria-valuetext={`${dollars(saved)} of ${dollars(target)}`}
        >
          <span className="saving-fill" style={{ width: `${pct}%` }} />
        </div>
        {!isOpen ? (
          <button type="button" className="saving-toggle" onClick={() => openMoney(i)}>
            Add money
          </button>
        ) : (
          <form className="saving-form" onSubmit={(e) => void changeSaved(e, i, 1)} noValidate>
            <label htmlFor={`amount-${i.id}`} className="sr-only">
              Amount in dollars
            </label>
            <div className="saving-row">
              <span className="saving-input">
                <span className="saving-dollar" aria-hidden="true">$</span>
                <input
                  id={`amount-${i.id}`}
                  className="input"
                  inputMode="decimal"
                  value={amount}
                  placeholder="15"
                  autoFocus
                  onChange={(e) => (setAmount(e.target.value), setMoneyError(null))}
                />
              </span>
              <button type="submit" className="btn-primary btn-small">
                Add
              </button>
            </div>
            {moneyError && <p className="form-error" role="alert">{moneyError}</p>}
            <div className="saving-links">
              {saved > 0 && (
                <>
                  <button type="button" className="saving-toggle" onClick={() => void changeSaved(null, i, -1)}>
                    Take this out
                  </button>
                  <button type="button" className="saving-toggle" onClick={() => setConfirmReset(i)}>
                    Reset to $0
                  </button>
                </>
              )}
              <button type="button" className="saving-toggle" onClick={() => setMoneyFor(null)}>
                Close
              </button>
            </div>
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="rich-list">
      <div className="rich-list-top">
        <p className="save-status" role="status">
          {message}
        </p>
        <div className="rich-list-actions">
          {kind === 'wishlist' && (
            <button type="button" className="btn-secondary btn-small" onClick={() => void share()}>
              Share wishlist
            </button>
          )}
          {editing !== 'new' && (
            <button type="button" className="btn-secondary btn-small" onClick={() => start('new')}>
              {copy.add}
            </button>
          )}
        </div>
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
                {savings(i)}
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

      {confirmReset && (
        <ConfirmDialog
          title="Reset to $0?"
          message={`The ${dollars(confirmReset.saved ?? 0)} saved for "${confirmReset.text}" goes back to $0. You can add money again any time.`}
          confirmLabel="Reset"
          tone="gentle"
          onConfirm={() => void reset()}
          onCancel={() => setConfirmReset(null)}
        />
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
