import { useEffect, useState } from 'react';
import EntryForm from './EntryForm';
import EntryView from './EntryView';
import ConfirmDialog from './ConfirmDialog';
import { READ_FAILED } from '../lib/messages';
import { useDataVersion } from '../lib/dataEvents';
import { deleteEntry, formatDay, getQuickEntry, saveQuickEntry, type QuickDraft, type QuickEntry } from '../lib/journal';

/**
 * The Journal's Quick entry for one day (mood, short note, tomorrow's intention), embedded on Daily Sprout. It reads
 * and writes the very same entry as Journal → Quick entry, so one made here shows there and the other way around.
 */
export default function QuickEntryPanel({ date }: { date: string }) {
  const version = useDataVersion();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [entry, setEntry] = useState<QuickEntry | undefined>();
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!entry) return;
    setDeleting(true);
    try {
      await deleteEntry(entry.id);
      setEntry(undefined);
      setEditing(true);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  useEffect(() => {
    let active = true;
    getQuickEntry(date)
      .then((saved) => {
        if (!active) return;
        setEntry(saved);
        if (!saved) setEditing(true); // nothing yet: show the form (an open edit is left alone on a refresh)
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [date, version]);

  useEffect(() => {
    setJustSaved(false);
    setEditing(false);
  }, [date]);

  async function handleSave(draft: QuickDraft) {
    const saved = await saveQuickEntry(date, draft, entry);
    setEntry(saved);
    setEditing(false);
    setJustSaved(true);
  }

  return (
    <section className="sprout-quick" aria-labelledby="sprout-quick-heading">
      <h2 id="sprout-quick-heading" className="section-title">
        Quick entry
      </h2>
      {status === 'loading' && <div className="card placeholder">Loading…</div>}
      {status === 'error' && (
        <div className="card form-error" role="alert">
          {READ_FAILED}
        </div>
      )}
      {status === 'ready' &&
        (editing || !entry ? (
          <EntryForm key={`${date}-${entry?.updatedAt ?? 'new'}`} initial={entry} onSave={handleSave} onCancel={entry ? () => setEditing(false) : undefined} dictation={false} />
        ) : (
          <>
            <EntryView entry={entry} onEdit={() => (setJustSaved(false), setEditing(true))} onDelete={() => setConfirming(true)} />
            {justSaved && (
              <p className="save-status" role="status">
                Saved on this device.
              </p>
            )}
          </>
        ))}
      {confirming && entry && (
        <ConfirmDialog
          title="Delete this entry?"
          message={`This permanently removes your quick entry from ${formatDay(entry.date)}. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
