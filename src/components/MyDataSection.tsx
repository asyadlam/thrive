import { useRef, useState, type ChangeEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import {
  BackupError,
  applyBackup,
  backupFileName,
  buildBackup,
  buildReadableText,
  downloadFile,
  readBackupFile,
  readableFileName,
  type CheckedBackup,
} from '../lib/backup';
import { formatLongDay, listAllEntries, todayKey } from '../lib/journal';
import { getLastBackupAt, setLastBackupAt } from '../lib/settings';

const DAY_MS = 24 * 60 * 60 * 1000;

type Message = { kind: 'ok' | 'error'; text: string } | null;

export default function MyDataSection({ onRestored }: { onRestored: () => void }) {
  const [lastBackupAt, setLastBackup] = useState(getLastBackupAt);
  const [busy, setBusy] = useState<'backup' | 'readable' | 'reading' | 'restoring' | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState<(CheckedBackup & { currentCount: number }) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const overdue = lastBackupAt !== null && Date.now() - Date.parse(lastBackupAt) > 30 * DAY_MS;
  const lastBackupLabel = lastBackupAt ? formatLongDay(todayKey(new Date(lastBackupAt))) : 'Never';

  async function handleBackup() {
    setBusy('backup');
    setMessage(null);
    try {
      const backup = await buildBackup();
      downloadFile(backupFileName(), JSON.stringify(backup, null, 2), 'application/json');
      setLastBackupAt(backup.exportedAt);
      setLastBackup(backup.exportedAt);
      setMessage({ kind: 'ok', text: `Backup downloaded (${backup.entries.length} entries).` });
    } catch {
      setMessage({ kind: 'error', text: "Couldn't create a backup. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function handleReadable() {
    setBusy('readable');
    setMessage(null);
    try {
      downloadFile(readableFileName(), await buildReadableText(), 'text/plain;charset=utf-8');
      setMessage({ kind: 'ok', text: 'Readable copy downloaded.' });
    } catch {
      setMessage({ kind: 'error', text: "Couldn't create the readable copy. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  // Step 1: pick + check the file. Nothing in the app changes here.
  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    setBusy('reading');
    setMessage(null);
    try {
      const [checked, current] = await Promise.all([readBackupFile(file), listAllEntries()]);
      setPending({ ...checked, currentCount: current.length });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof BackupError ? err.message : "That file couldn't be read as a Thrive backup.",
      });
    } finally {
      setBusy(null);
    }
  }

  // Step 2: only after you confirm.
  async function handleRestore() {
    if (!pending) return;
    setBusy('restoring');
    try {
      await applyBackup(pending);
      const total = pending.entries.length;
      setPending(null);
      setMessage({ kind: 'ok', text: `Restored ${total} ${total === 1 ? 'entry' : 'entries'} and your settings.` });
      onRestored();
    } catch {
      setPending(null);
      setMessage({ kind: 'error', text: "Restoring didn't finish, so nothing was changed. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <section className="card settings-section" aria-labelledby="my-data-heading">
      <h2 id="my-data-heading" className="settings-heading">
        My data
      </h2>
      <p className="hint">Your journal lives only on this device. A backup keeps a copy you control.</p>

      <div className="backup-status">
        <span>
          Last backup: <strong>{lastBackupLabel}</strong>
        </span>
        {overdue && <span className="hint">It's been a while — a fresh backup takes a few seconds.</span>}
      </div>

      <div className="data-actions">
        <button type="button" className="btn-primary" onClick={handleBackup} disabled={busy !== null}>
          {busy === 'backup' ? 'Preparing…' : 'Download backup'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {busy === 'reading' ? 'Checking file…' : 'Restore from backup'}
        </button>
        <button type="button" className="btn-secondary" onClick={handleReadable} disabled={busy !== null}>
          {busy === 'readable' ? 'Preparing…' : 'Download readable copy'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFile}
        />
      </div>

      <p className={message?.kind === 'error' ? 'form-error' : 'save-status'} role={message?.kind === 'error' ? 'alert' : 'status'}>
        {message?.text ?? ''}
      </p>

      {pending && (
        <ConfirmDialog
          title="Replace everything with this backup?"
          message={`This backup has ${plural(pending.quickCount, 'quick entry', 'quick entries')} and ${plural(
            pending.talkCount,
            'journal page',
            'journal pages',
          )}${pending.exportedAt ? `, saved ${formatLongDay(todayKey(new Date(pending.exportedAt)))}` : ''}. Restoring will replace everything currently in Thrive on this device — ${plural(
            pending.currentCount,
            'entry',
            'entries',
          )} and your settings. This can't be undone, so download a backup of what's here first if you might want it.`}
          confirmLabel="Replace everything"
          busy={busy === 'restoring'}
          busyLabel="Restoring…"
          onConfirm={handleRestore}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
