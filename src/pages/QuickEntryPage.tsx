import { useEffect, useMemo, useState } from 'react';
import PageShell from '../components/PageShell';
import EntryForm from '../components/EntryForm';
import EntryView from '../components/EntryView';
import { useBook } from '../lib/book';
import { formatDay, getQuickEntry, saveQuickEntry, todayKey, type QuickDraft, type QuickEntry } from '../lib/journal';

type Status = 'loading' | 'ready' | 'error';

export default function QuickEntryPage() {
  const date = useMemo(() => todayKey(), []);
  const { book, home } = useBook();

  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const [entry, setEntry] = useState<QuickEntry | undefined>();
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getQuickEntry(date, book)
      .then((saved) => {
        if (!active) return;
        setEntry(saved);
        setEditing(!saved);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Could not open on-device storage.');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [date, book]);

  async function handleSave(draft: QuickDraft) {
    const saved = await saveQuickEntry(date, draft, entry, book);
    setEntry(saved);
    setEditing(false);
    setJustSaved(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startEditing() {
    setJustSaved(false);
    setEditing(true);
  }

  return (
    <PageShell title="Quick entry" subtitle={formatDay(date)} back={home}>
      {status === 'loading' && <div className="card placeholder">Loading…</div>}

      {status === 'error' && (
        <div className="card form-error" role="alert">
          {loadError} Journal entries can't be saved in this browser right now.
        </div>
      )}

      {status === 'ready' && (
        <>
          <p className="save-status" role="status">
            {justSaved ? 'Saved on this device.' : ''}
          </p>
          {editing ? (
            <EntryForm
              key={entry?.updatedAt ?? 'new'}
              initial={entry}
              onSave={handleSave}
              onCancel={entry ? () => setEditing(false) : undefined}
            />
          ) : (
            entry && <EntryView entry={entry} onEdit={startEditing} />
          )}
        </>
      )}
    </PageShell>
  );
}
