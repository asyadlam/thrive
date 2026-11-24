import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  cloudAvailable,
  cloudBackupInfo,
  fetchCloudBackup,
  getSession,
  isLinkedDevice,
  markRestoredFromCloud,
  onSessionChange,
} from '../lib/cloud';
import { backupWhen } from './MyDataSection';
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
 *  - Device with its own data: "Merge them" (the same merge as "Add a file to my data"), "Use backup only" (the
 *    usual Restore from cloud, with its calm Replace confirm) or "Not now".
 *  - Empty device (merge and restore are the same there): "Restore my backup" or "Not now".
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
    if (!offer || merging) return;
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
            ? `Added ${describeCounts(plan.added)} from your backup. Everything that was here is still here.`
            : 'Everything in your backup was already here.',
      });
    } catch {
      setResult({ kind: 'error', text: 'Merging didn’t finish, so nothing here was changed. Please try again.' });
    } finally {
      setMerging(false);
    }
  }

  if (result) {
    return (
      <div className="dialog-backdrop">
        <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="nd-result-title" aria-describedby="nd-result-message">
          <h2 id="nd-result-title">{result.kind === 'ok' ? 'All together now' : 'Not merged yet'}</h2>
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

  const when = backupWhen(offer.backupAt);

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
        <h2 id="nd-title">Your backup is here</h2>
        <p id="nd-message">
          {offer.hasData
            ? `You are signed in on this device. Your cloud backup from ${when} can join what is on this device.`
            : `You are signed in on this device. Your cloud backup from ${when} is ready.`}
        </p>
        <div className="new-device-actions">
          {offer.hasData ? (
            <>
              <button type="button" className="choice-btn choice-btn-main" onClick={() => void merge()} disabled={merging}>
                <strong>{merging ? 'Merging…' : 'Merge them'}</strong>
                <span>Keeps everything here and adds your backup.</span>
              </button>
              <button type="button" className="choice-btn" onClick={replace} disabled={merging}>
                <strong>Use backup only</strong>
                <span>Replaces what is here with your backup.</span>
              </button>
            </>
          ) : (
            <button type="button" className="choice-btn choice-btn-main" onClick={replace}>
              <strong>Restore my backup</strong>
              <span>Brings your backup onto this device.</span>
            </button>
          )}
          <button type="button" className="new-device-later" onClick={notNow} disabled={merging}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
