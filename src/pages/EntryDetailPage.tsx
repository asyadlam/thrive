import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import EntryView from '../components/EntryView';
import EntryForm from '../components/EntryForm';
import TalkView from '../components/TalkView';
import ConfirmDialog from '../components/ConfirmDialog';
import { useBook } from '../lib/book';
import { deleteEntry, formatDay, getEntry, saveQuickEntry, type JournalEntry, type QuickDraft } from '../lib/journal';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

export default function EntryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { book, base, page } = useBook();

  const [status, setStatus] = useState<Status>('loading');
  const [entry, setEntry] = useState<JournalEntry | undefined>();
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getEntry(id, book)
      .then((saved) => {
        if (!active) return;
        setEntry(saved);
        setStatus(saved ? 'ready' : 'not-found');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [id, book]);

  const backTo = entry
    ? `/journal/look-back?month=${entry.date.slice(0, 7)}&day=${entry.date}`
    : '/journal/look-back';

  function handleEdit() {
    if (!entry) return;
    setJustSaved(false);
    if (entry.type === 'talk') {
      navigate(`${base}/talk/${entry.id}`, { state: { from: `${base}/entry/${entry.id}` } });
    } else {
      setEditing(true);
    }
  }

  async function handleQuickSave(draft: QuickDraft) {
    if (entry?.type !== 'quick') return;
    const saved = await saveQuickEntry(entry.date, draft, entry, book);
    setEntry(saved);
    setEditing(false);
    setJustSaved(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete() {
    if (!entry) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEntry(entry.id, book);
      navigate(backTo, { replace: true });
    } catch {
      setDeleting(false);
      setConfirming(false);
      setDeleteError("Couldn't delete this entry. Please try again.");
    }
  }

  const title = entry?.type === 'talk' ? page : 'Quick entry';
  const subtitle = entry ? formatDay(entry.date) : '';

  return (
    <PageShell title={status === 'ready' ? title : 'Entry'} subtitle={subtitle} back={{ to: backTo, label: 'Look back' }}>
      {status === 'loading' && <div className="card placeholder">Loading…</div>}
      {status === 'not-found' && <div className="card placeholder">This entry isn't on this device anymore.</div>}
      {status === 'error' && (
        <div className="card form-error" role="alert">
          Couldn't read this entry on this device.
        </div>
      )}

      {status === 'ready' && entry && (
        <>
          <p className="save-status" role="status">
            {justSaved ? 'Saved on this device.' : ''}
          </p>
          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError}
            </p>
          )}

          {entry.type === 'quick' ? (
            book === 'journal' ? (
              // Quick entries are created and edited on Daily Sprout; here they're read-only.
              <EntryView entry={entry} openInSprout />
            ) : editing ? (
              <EntryForm key={entry.updatedAt} initial={entry} onSave={handleQuickSave} onCancel={() => setEditing(false)} />
            ) : (
              <EntryView entry={entry} onEdit={handleEdit} onDelete={() => setConfirming(true)} />
            )
          ) : (
            <TalkView entry={entry} onEdit={handleEdit} onDelete={() => setConfirming(true)} />
          )}

          {confirming && (
            <ConfirmDialog
              title="Delete this entry?"
              message={`This permanently removes your ${
                entry.type === 'quick' ? 'quick entry' : page.toLowerCase()
              } from ${formatDay(entry.date)}. This can't be undone.`}
              confirmLabel="Delete"
              busy={deleting}
              onConfirm={handleDelete}
              onCancel={() => setConfirming(false)}
            />
          )}
        </>
      )}
    </PageShell>
  );
}
