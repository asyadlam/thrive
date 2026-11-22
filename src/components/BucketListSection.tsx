import { useCallback, useEffect, useState, type FormEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import EmptyState from './EmptyState';
import { formatShortDay, todayKey } from '../lib/journal';
import { BUCKET_NAME_MAX, BUCKET_NOTE_MAX, deleteBucketItem, listBucketList, saveBucketItem, setBucketDone, type BucketItem } from '../lib/profile';

const doneDay = (iso: string) => {
  const key = todayKey(new Date(iso));
  return key.slice(0, 4) === todayKey().slice(0, 4) ? formatShortDay(key) : `${formatShortDay(key)}, ${key.slice(0, 4)}`;
};

/** Bucket list: experiences I'd love to have; "Did it" moves one to "Done it ✨" with the date (and it can go back). */
export default function BucketListSection() {
  const [list, setList] = useState<{ todo: BucketItem[]; done: BucketItem[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<null | 'new' | string>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<BucketItem | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList(await listBucketList());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  function open(next: null | 'new' | BucketItem) {
    const item = next && next !== 'new' ? next : null;
    setEditing(next === null ? null : next === 'new' ? 'new' : next.id);
    setName(item?.name ?? '');
    setNote(item?.note ?? '');
    setError(null);
    setMessage('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('What would you love to do? Give it a name.');
    setBusy(true);
    try {
      const all = [...(list?.todo ?? []), ...(list?.done ?? [])];
      const existing = all.find((b) => b.id === editing);
      await saveBucketItem({ name, note }, existing);
      setMessage(existing ? 'Saved.' : 'Added to your bucket list.');
      setEditing(null);
      await refresh();
    } catch {
      setError("Couldn't save this on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function did(item: BucketItem, value: boolean) {
    await setBucketDone(item, value);
    setMessage(value ? `You did it — ${item.name}! ✨` : 'Moved back to your bucket list.');
    await refresh();
  }

  async function remove() {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteBucketItem(confirm.id);
      setEditing(null);
      setMessage('Deleted.');
      await refresh();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const form = (existing?: BucketItem) => (
    <form className="card positive-form" onSubmit={save} noValidate>
      <div className="field">
        <label htmlFor="bucket-name">One day I want to…</label>
        <input id="bucket-name" className="input" value={name} maxLength={BUCKET_NAME_MAX} placeholder="e.g. See the northern lights" autoFocus onChange={(e) => (setName(e.target.value), setError(null))} />
      </div>
      <div className="field">
        <label htmlFor="bucket-note">
          Note <span className="optional">(optional)</span>
        </label>
        <input id="bucket-note" className="input" value={note} maxLength={BUCKET_NOTE_MAX} placeholder="e.g. Maybe Norway, in winter" onChange={(e) => setNote(e.target.value)} />
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

  const details = (b: BucketItem) => (
    <button type="button" className="wish-main" onClick={() => open(b)} aria-label={`Edit ${b.name}`}>
      <span className="wish-name">{b.name}</span>
      {b.note && <span className="wish-note">{b.note}</span>}
    </button>
  );

  return (
    <section className="bucketlist" aria-labelledby="bucketlist-heading">
      <div className="goals-header">
        <h2 id="bucketlist-heading" className="section-title">
          Bucket list
        </h2>
        {editing !== 'new' && (
          <button type="button" className="btn-secondary btn-small" onClick={() => open('new')}>
            + Add a dream
          </button>
        )}
      </div>
      <p className="save-status" role="status">
        {message}
      </p>

      {editing === 'new' && form()}
      {failed && <p className="form-error" role="alert">Couldn't read your bucket list on this device.</p>}
      {list && list.todo.length === 0 && list.done.length === 0 && editing !== 'new' && (
        <EmptyState>Your bucket list is empty. What's one thing you'd love to do someday?</EmptyState>
      )}

      {list && list.todo.length > 0 && (
        <ul className="wish-list">
          {list.todo.map((b) =>
            editing === b.id ? (
              <li key={b.id}>{form(b)}</li>
            ) : (
              <li key={b.id} className="wish-item">
                {details(b)}
                <button type="button" className="wish-got" onClick={() => void did(b, true)}>
                  Did it
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {list && list.done.length > 0 && (
        <div className="wish-got-area">
          <h3 className="saved-label">Done it ✨</h3>
          <ul className="wish-list">
            {list.done.map((b) =>
              editing === b.id ? (
                <li key={b.id}>{form(b)}</li>
              ) : (
                <li key={b.id} className="wish-item done">
                  {details(b)}
                  <span className="wish-side">
                    <span className="wish-got-date">{doneDay(b.doneAt!)}</span>
                    <button type="button" className="wish-back" onClick={() => void did(b, false)}>
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
          title="Delete this from your bucket list?"
          message={`"${confirm.name}" will be removed from your bucket list.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
