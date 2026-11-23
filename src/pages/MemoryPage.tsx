import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SAVE_FAILED } from '../lib/messages';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { MEMORY_MAX, addMemory, deleteMemory, forgetAllMemories, listMemories, updateMemory, type MemoryNote } from '../lib/memory';
import { formatTalkSummaryDate } from '../lib/journal';

type Status = 'loading' | 'ready' | 'error';
/** What's open: nothing, the "add a note" form, or one note being edited (by id). */
type Editing = null | 'new' | string;

/** "What your companion remembers": every memory note, which I can edit, delete, add to, or wipe. */
export default function MemoryPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<null | MemoryNote | 'all'>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setNotes(await listMemories());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function open(next: Editing, start = '') {
    setEditing(next);
    setText(start);
    setError(null);
    setMessage('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError('Write a short note to save it.');
      return;
    }
    setBusy(true);
    try {
      const note = notes.find((n) => n.id === editing);
      if (note) await updateMemory(note, text);
      else await addMemory(text);
      setMessage(note ? 'Note saved.' : 'Note added.');
      setEditing(null);
      await refresh();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'all') await forgetAllMemories();
      else await deleteMemory(confirm.id);
      setMessage(confirm === 'all' ? 'Your companion has forgotten everything.' : 'Note deleted.');
      setEditing(null);
      await refresh();
    } catch {
      setMessage("Couldn't delete right now. Please try again.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const form = (
    <form className="card positive-form memory-form" onSubmit={save} noValidate>
      <label htmlFor="memory-text">{editing === 'new' ? 'A new note' : 'Edit note'}</label>
      <textarea
        id="memory-text"
        className="input"
        rows={3}
        value={text}
        maxLength={MEMORY_MAX}
        placeholder="e.g. Deadline changes at work are a recurring stress trigger."
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save note'}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <PageShell
      title="What your companion remembers"
      subtitle="Short notes it can use in your talks. Only you add, change or remove them."
      back={{ to: '/settings', label: 'Settings' }}
    >
      <section className="memory-section" aria-labelledby="memory-list-heading">
        <div className="goals-header">
          <h2 id="memory-list-heading" className="sr-only">
            Memory notes
          </h2>
          {editing !== 'new' && (
            <button type="button" className="btn-secondary btn-small" onClick={() => open('new')}>
              + Add a note
            </button>
          )}
        </div>

        <p className="save-status" role="status">
          {message}
        </p>

        {editing === 'new' && form}

        {status === 'loading' && <p className="hint">Loading…</p>}
        {status === 'error' && (
          <p className="form-error" role="alert">
            Couldn't read your companion's memory on this device.
          </p>
        )}

        {status === 'ready' && notes.length === 0 && editing !== 'new' && (
          <div className="card placeholder">
            Your companion doesn't remember anything yet. Notes you approve after a talk will appear here.
          </div>
        )}

        {status === 'ready' && notes.length > 0 && (
          <ul className="memory-list">
            {notes.map((note) =>
              editing === note.id ? (
                <li key={note.id}>{form}</li>
              ) : (
                <li key={note.id} className="memory-item">
                  <button
                    type="button"
                    className="memory-text"
                    onClick={() => open(note.id, note.text)}
                    aria-label={`Edit note: ${note.text}`}
                  >
                    <span>{note.text}</span>
                    <span className="memory-date">
                      {formatTalkSummaryDate(note.createdAt)}
                      {note.updatedAt !== note.createdAt && ' · edited'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="letter-delete memory-delete"
                    aria-label={`Delete note: ${note.text}`}
                    onClick={() => setConfirm(note)}
                  >
                    Delete
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {status === 'ready' && notes.length > 0 && (
        <button type="button" className="btn-danger-outline memory-forget" onClick={() => setConfirm('all')}>
          Forget everything
        </button>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm === 'all' ? 'Forget everything?' : 'Delete this note?'}
          message={
            confirm === 'all'
              ? `All ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} will be deleted from this device, and your companion won't remember any of it. This can't be undone.`
              : `"${confirm.text}" will be removed from your companion's memory. This can't be undone.`
          }
          confirmLabel={confirm === 'all' ? 'Forget everything' : 'Delete'}
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </PageShell>
  );
}
