import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { formatTime } from '../lib/journal';
import { setLastBackupAt } from '../lib/settings';
import { applyMerge, describeCounts, planMerge, totalAdded, type MergePlan } from '../lib/merge';
import {
  CloudError,
  backUpToCloud,
  cloudBackupInfo,
  fetchCloudBackup,
  getLastCloudBackupAt,
  getSession,
  isLinkedDevice,
  markRestoredFromCloud,
  onSessionChange,
  onSyncStatus,
  readSyncStatus,
  type SyncStatus,
} from '../lib/cloud';

/** A short backup date, "Nov 23, 2026 at 4:05 PM", so backup lines stay short on a phone. */
/** "today at 9:41 PM", "yesterday at 8:02 AM", or "Nov 3, 2026 at 9:41 PM". */
function syncWhen(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day(d) === day(now)) return `today at ${formatTime(iso)}`;
  if (day(d) === day(yesterday)) return `yesterday at ${formatTime(iso)}`;
  return backupWhen(iso);
}

export const backupWhen = (iso: string) =>
  `${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${formatTime(iso)}`;

type Message = { kind: 'ok' | 'error'; text: string } | null;
/** A checked backup waiting for the restore confirm; `cloudAt` is set when it's the cloud copy. */
type Pending = CheckedBackup & { cloudAt?: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Settings → My data, as two cards: "On this device" (the backup file actions) and "Cloud backup" (only when
 * logged in: Back up to cloud and Restore from cloud, plus one quiet line saying when it last synced — the
 * automatic sync in lib/autoSync.ts does the rest on its own). Short, kind wording throughout.
 */
export default function MyDataSection({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState<'backup' | 'readable' | 'reading' | 'restoring' | 'merge-reading' | 'merging' | null>(null);
  const [mergePlan, setMergePlan] = useState<MergePlan | null>(null);
  const mergeInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  // Cloud backup (only when logged in)
  const [signedIn, setSignedIn] = useState(false);
  const [lastCloud, setLastCloud] = useState<string | null>(getLastCloudBackupAt);
  const [sync, setSync] = useState<SyncStatus | null>(readSyncStatus);
  useEffect(() => onSyncStatus(() => setSync(readSyncStatus())), []);
  const [cloudBusy, setCloudBusy] = useState<null | 'backup' | 'reading'>(null);
  const [cloudMessage, setCloudMessage] = useState<Message>(null);
  const [confirmCloudReplace, setConfirmCloudReplace] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const restoreRequested = params.get('restore') === 'cloud';

  useEffect(() => {
    let active = true;
    const follow = (on: boolean) => {
      if (!active) return;
      setSignedIn(on);
      if (on) {
        cloudBackupInfo()
          .then((info) => active && setLastCloud(info?.updatedAt ?? null))
          .catch(() => undefined);
      }
    };
    getSession()
      .then((s) => follow(!!s))
      .catch(() => undefined);
    const stop = onSessionChange((s) => follow(!!s));
    return () => {
      active = false;
      stop();
    };
  }, []);

  // ---------- On this device ----------

  async function handleBackup() {
    setBusy('backup');
    setMessage(null);
    try {
      const backup = await buildBackup();
      downloadFile(backupFileName(), JSON.stringify(backup, null, 2), 'application/json');
      setLastBackupAt(backup.exportedAt);
      setMessage({ kind: 'ok', text: 'Backup downloaded.' });
    } catch {
      setMessage({ kind: 'error', text: "Couldn't make a backup just now. Please try again." });
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
      setMessage({ kind: 'error', text: "Couldn't make the readable copy. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  // Restore from a file, step 1: pick + check the file. Nothing changes here.
  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    setBusy('reading');
    setMessage(null);
    try {
      setPending(await readBackupFile(file));
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof BackupError ? err.message : "That file couldn't be read as a Thrive backup." });
    } finally {
      setBusy(null);
    }
  }

  // Restore, step 2 (file or cloud): only after "Replace".
  async function handleRestore() {
    if (!pending) return;
    const fromCloud = !!pending.cloudAt;
    const show = fromCloud ? setCloudMessage : setMessage;
    setBusy('restoring');
    try {
      await applyBackup(pending);
      if (pending.cloudAt) {
        await markRestoredFromCloud(pending.cloudAt);
        setLastCloud(pending.cloudAt);
      }
      show({ kind: 'ok', text: fromCloud ? 'Restored from your cloud backup.' : 'Restored from your backup file.' });
      onRestored();
    } catch {
      show({ kind: 'error', text: "Restoring didn't finish, so nothing was changed. Please try again." });
    } finally {
      setPending(null);
      setBusy(null);
    }
  }

  // Add a file to my data, step 1: pick + check the file and work out what would be added. Nothing changes here.
  async function handleMergeFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('merge-reading');
    setMessage(null);
    try {
      const plan = await planMerge(await readBackupFile(file));
      if (totalAdded(plan.added) === 0) setMessage({ kind: 'ok', text: 'Everything in this file is already here.' });
      else setMergePlan(plan);
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof BackupError ? err.message : "That file couldn't be read as a Thrive backup." });
    } finally {
      setBusy(null);
    }
  }

  // Add a file to my data, step 2: only after "Add".
  async function handleMerge() {
    if (!mergePlan) return;
    setBusy('merging');
    try {
      await applyMerge(mergePlan);
      setMessage({ kind: 'ok', text: `Added ${describeCounts(mergePlan.added)}. ${plural(mergePlan.skipped, 'item was', 'items were')} already here.` });
      onRestored();
    } catch {
      setMessage({ kind: 'error', text: "Adding didn't finish, so nothing was changed. Please try again." });
    } finally {
      setMergePlan(null);
      setBusy(null);
    }
  }

  // ---------- Cloud backup ----------

  /** Back up to cloud. If there's already a cloud copy this device hasn't made or restored, ask first. */
  async function handleCloudBackup(confirmed = false) {
    setCloudBusy('backup');
    setCloudMessage(null);
    try {
      if (!confirmed) {
        const info = await cloudBackupInfo();
        if (info && !(await isLinkedDevice())) {
          setConfirmCloudReplace(info.updatedAt);
          return;
        }
      }
      setConfirmCloudReplace(null);
      const at = await backUpToCloud();
      setLastCloud(at);
      setCloudMessage({ kind: 'ok', text: 'Backed up.' });
    } catch (err) {
      setConfirmCloudReplace(null);
      setCloudMessage({ kind: 'error', text: err instanceof CloudError ? err.message : 'Couldn’t back up just now. Please try again.' });
    } finally {
      setCloudBusy(null);
    }
  }

  // Arriving from the new-device prompt (?restore=cloud): start the usual Restore from cloud once logged in.
  useEffect(() => {
    if (!restoreRequested || !signedIn) return;
    setParams({}, { replace: true });
    void handleCloudRestore();
    window.setTimeout(() => document.getElementById('cloud-heading')?.scrollIntoView({ block: 'start' }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreRequested, signedIn]);

  /** Restore from cloud: download and check it, then the calm Replace confirm. */
  async function handleCloudRestore() {
    setCloudBusy('reading');
    setCloudMessage(null);
    setMessage(null);
    try {
      const copy = await fetchCloudBackup();
      if (!copy) {
        setCloudMessage({ kind: 'ok', text: 'There’s no cloud backup for this account yet.' });
        return;
      }
      setPending({ ...copy.backup, cloudAt: copy.updatedAt });
    } catch (err) {
      setCloudMessage({ kind: 'error', text: err instanceof CloudError ? err.message : 'Couldn’t open your cloud backup. Please try again.' });
    } finally {
      setCloudBusy(null);
    }
  }

  const status = (m: Message) => (
    <p className={m?.kind === 'error' ? 'form-error' : 'save-status'} role={m?.kind === 'error' ? 'alert' : 'status'}>
      {m?.text ?? ''}
    </p>
  );

  return (
    <>
      <section className="card settings-section data-card" aria-labelledby="my-data-heading">
        <h2 id="my-data-heading" className="settings-heading">
          On this device
        </h2>
        <p className="data-status">Your journal lives here.</p>
        <div className="data-actions">
          <button type="button" className="btn-primary" onClick={handleBackup} disabled={busy !== null}>
            {busy === 'backup' ? 'Preparing…' : 'Download backup'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            {busy === 'reading' ? 'Checking file…' : 'Restore from a file'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => mergeInput.current?.click()} disabled={busy !== null}>
            {busy === 'merge-reading' ? 'Checking file…' : 'Add a file to my data'}
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFile} />
          <input ref={mergeInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleMergeFile} />
        </div>
        <button type="button" className="data-quiet-link" onClick={handleReadable} disabled={busy !== null}>
          {busy === 'readable' ? 'Preparing…' : 'Download a readable copy'}
        </button>
        {status(message)}
      </section>

      {signedIn && (
        <section className="card settings-section data-card" aria-labelledby="cloud-heading">
          <h2 id="cloud-heading" className="settings-heading">
            Cloud backup
          </h2>
          <p className="data-status" role="status">
            {sync && !sync.ok
              ? 'Couldn’t sync last time, will try again.'
              : sync
                ? `Last synced: ${syncWhen(sync.at)}${sync.added > 0 ? ` · ${sync.added} ${sync.added === 1 ? 'entry' : 'entries'} added from your backup` : ''}`
                : lastCloud
                  ? `Last synced: ${syncWhen(lastCloud)}`
                  : 'No cloud backup yet.'}
          </p>
          <div className="data-actions">
            <button type="button" className="btn-primary" onClick={() => void handleCloudBackup()} disabled={cloudBusy !== null || busy !== null}>
              {cloudBusy === 'backup' ? 'Backing up…' : 'Back up to cloud'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => void handleCloudRestore()} disabled={cloudBusy !== null || busy !== null}>
              {cloudBusy === 'reading' ? 'Checking…' : 'Restore from cloud'}
            </button>
          </div>
          <p className="hint">A backup is a copy kept safely online, in case this device is lost.</p>
          {status(cloudMessage)}
        </section>
      )}

      {confirmCloudReplace && (
        <ConfirmDialog
          title="Replace your cloud backup?"
          message={`Your cloud backup from ${backupWhen(confirmCloudReplace)} will be replaced with what is on this device now.`}
          confirmLabel="Replace backup"
          cancelLabel="Keep it"
          busy={cloudBusy === 'backup'}
          busyLabel="Backing up…"
          onConfirm={() => void handleCloudBackup(true)}
          onCancel={() => setConfirmCloudReplace(null)}
        />
      )}

      {pending && (
        <ConfirmDialog
          title="Use your backup?"
          message={
            pending.cloudAt
              ? `This replaces what is on this device with your backup from ${backupWhen(pending.cloudAt)}. The backup itself stays safe in the cloud.`
              : `This replaces what is on this device with your backup${pending.exportedAt ? ` from ${backupWhen(pending.exportedAt)}` : ''}. The file itself stays as it is.`
          }
          confirmLabel="Replace"
          cancelLabel="Keep mine instead"
          busy={busy === 'restoring'}
          busyLabel="Restoring…"
          onConfirm={handleRestore}
          onCancel={() => setPending(null)}
        />
      )}

      {mergePlan && (
        <ConfirmDialog
          title="Add this file to your data?"
          message={`This adds ${describeCounts(mergePlan.added)}. Everything already here stays as it is.`}
          confirmLabel="Add"
          busy={busy === 'merging'}
          busyLabel="Adding…"
          tone="gentle"
          onConfirm={handleMerge}
          onCancel={() => setMergePlan(null)}
        />
      )}
    </>
  );
}
