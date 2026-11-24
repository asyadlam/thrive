import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import {
  cloudAvailable,
  cloudBackupInfo,
  fetchCloudBackup,
  getSession,
  isLinkedDevice,
  markRestoredFromCloud,
  onSessionChange,
} from '../lib/cloud';
import { formatLongDay, formatTime, todayKey } from '../lib/journal';
import { applyMerge, describeCounts, deviceHasOwnData, planMerge, totalAdded } from '../lib/merge';

/** Remembered on this device once the person makes a choice: the prompt never shows here again. */
const DONE_KEY = 'thrive.newDevicePromptDone';

const seen = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true; // can't remember a choice: better never to show it than to show it every time
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* nothing to remember */
  }
};

type Offer = { backupAt: string; hasData: boolean };
type Result = { kind: 'ok' | 'error'; text: string };

/**
 * "New device" prompt. Shown once per device, only when someone is logged in, their account has a cloud backup,
 * and this device hasn't taken data from that account yet (never restored, merged or backed up to it).
 *  - Empty device: "Restore my backup" (the usual Restore from cloud, with its confirm) or "Not now".
 *  - Device with its own data: "Merge the backup in" (the same merge as "Add a backup to my data"), "Replace with
 *    the backup" (the usual Restore from cloud, with its "cloud copy wins" confirm) or "Not now".
 * Any choice is remembered on this device.
 */
export default function NewDevicePrompt() {
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!cloudAvailable() || seen()) return;
    let active = true;
    const check = async () => {
      try {
        if (seen() || !(await getSession())) return;
        if (await isLinkedDevice()) return; // this device already backed up to, restored or merged from this account
        const info = await cloudBackupInfo();
        if (!info) return; // no cloud backup: nothing to offer
        const hasData = await deviceHasOwnData();
        if (active && !seen()) setOffer({ backupAt: info.updatedAt, hasData });
      } catch {
        /* quiet: Restore from cloud in Settings is always there */
      }
    };
    void check();
    const stop = onSessionChange((s) => (s ? void check() : setOffer(null)));
    return () => {
      active = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!offer?.hasData || merging) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && notNow();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function notNow() {
    markSeen();
    setOffer(null);
  }

  function replace() {
    markSeen();
    setOffer(null);
    navigate('/settings?restore=cloud'); // the usual Restore from cloud, with its confirm
  }

  async function merge() {
    setMerging(true);
    try {
      const copy = await fetchCloudBackup();
      if (!copy) {
        markSeen();
        setOffer(null);
        setResult({ kind: 'ok', text: 'There’s no cloud backup for this account yet.' });
        return;
      }
      const plan = await planMerge(copy.backup);
      if (totalAdded(plan.added) > 0) await applyMerge(plan);
      await markRestoredFromCloud(copy.updatedAt); // this device has now taken data from this account
      markSeen();
      setOffer(null);
      setResult({
        kind: 'ok',
        text:
          totalAdded(plan.added) > 0
            ? `Added ${describeCounts(plan.added)}. Skipped ${plan.skipped} ${plan.skipped === 1 ? 'item' : 'items'} already here. Everything that was on this device is still here.`
            : 'Everything in your cloud backup is already on this device, so there was nothing to add.',
      });
    } catch {
      setResult({ kind: 'error', text: 'The merge didn’t finish, so nothing on this device was changed. Please try again.' });
    } finally {
      setMerging(false);
    }
  }

  if (result) {
    return (
      <div className="dialog-backdrop">
        <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="nd-result-title" aria-describedby="nd-result-message">
          <h2 id="nd-result-title">{result.kind === 'ok' ? 'Merged from your cloud backup' : 'Not merged'}</h2>
          <p id="nd-result-message">{result.text}</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => (result.kind === 'ok' ? window.location.reload() : setResult(null))} // reload so every page shows the merged data
            >
              {result.kind === 'ok' ? 'Done' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!offer) return null;

  const when = `${formatLongDay(todayKey(new Date(offer.backupAt)))} at ${formatTime(offer.backupAt)}`;

  if (!offer.hasData) {
    return (
      <ConfirmDialog
        title="Welcome back"
        message={`This device doesn't have your Thrive on it yet. Your cloud backup from ${when} is ready.`}
        confirmLabel="Restore my backup"
        cancelLabel="Not now"
        tone="gentle"
        onConfirm={replace}
        onCancel={notNow}
      />
    );
  }

  return (
    <div className="dialog-backdrop" onClick={merging ? undefined : notNow}>
      <div
        className="dialog new-device-choice"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nd-title"
        aria-describedby="nd-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="nd-title">Welcome back</h2>
        <p id="nd-message">This device has its own Thrive data, and your account also has a cloud backup from {when}. What would you like to do?</p>
        <div className="new-device-actions">
          <button type="button" className="btn-primary" onClick={() => void merge()} disabled={merging}>
            {merging ? 'Merging…' : 'Merge the backup in'}
          </button>
          <button type="button" className="btn-secondary" onClick={replace} disabled={merging}>
            Replace with the backup
          </button>
          <button type="button" className="btn-secondary new-device-later" onClick={notNow} disabled={merging}>
            Not now
          </button>
        </div>
        <p className="hint new-device-note">
          Merge keeps everything on this device and adds the backup. Replace removes what's here and uses only the backup.
        </p>
      </div>
    </div>
  );
}
