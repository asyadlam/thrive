import { useEffect } from 'react';
import { applyBackup } from '../lib/backup';
import { cloudAvailable, cloudBackupInfo, fetchCloudBackup, getSession, isLinkedDevice, isRecovering, markRestoredFromCloud, onSessionChange } from '../lib/cloud';
import { applyMerge, deviceHasOwnData, planMerge, totalAdded } from '../lib/merge';

/*
  New-device cloud sync: no pop-up, no question. When someone is logged in, their account has a cloud backup, and
  this device hasn't taken data from that account yet (never restored, merged or backed up to it):
   - this device is empty      → restore the backup here (nothing to replace)
   - this device has its data  → merge the backup in (the same merge as "Add a file to my data": adds, never removes)
  Either way this device is then linked to the account, so it only happens once per login, and Home shows one small
  line that can be dismissed. Replacing everything with the cloud copy stays a deliberate choice in Settings.
*/

const NOTICE_KEY = 'thrive.cloudSyncNotice';
const NOTICE_EVENT = 'thrive:cloud-sync';

export type SyncNotice = 'restored' | 'merged';

export const SYNC_NOTICE_TEXT: Record<SyncNotice, string> = {
  restored: 'Your backup is on this device now.',
  merged: 'Your backup was added to this device. Nothing was removed.',
};

/** Home: the line to show once (and forget), if a sync just happened. */
export function takeSyncNotice(): SyncNotice | null {
  try {
    const v = localStorage.getItem(NOTICE_KEY);
    localStorage.removeItem(NOTICE_KEY);
    return v === 'restored' || v === 'merged' ? v : null;
  } catch {
    return null;
  }
}

/** Home listens for a sync finishing while it's already open. */
export function onSyncNotice(cb: () => void): () => void {
  window.addEventListener(NOTICE_EVENT, cb);
  return () => window.removeEventListener(NOTICE_EVENT, cb);
}

function leaveNotice(kind: SyncNotice) {
  try {
    localStorage.setItem(NOTICE_KEY, kind);
  } catch {
    /* no line then; the data is still synced */
  }
}

let syncing = false;

async function syncIfNeeded(): Promise<void> {
  if (syncing || isRecovering()) return; // a password reset is open: wait until the new password is saved
  syncing = true;
  try {
    if (!(await getSession()) || (await isLinkedDevice())) return;
    if (!(await cloudBackupInfo())) return; // no cloud backup: nothing to bring here
    const copy = await fetchCloudBackup();
    if (!copy) return;
    if (!(await deviceHasOwnData())) {
      await applyBackup(copy.backup);
      await markRestoredFromCloud(copy.updatedAt);
      leaveNotice('restored');
      window.location.reload(); // the restored settings (name, companion…) and entries show everywhere at once
      return;
    }
    const plan = await planMerge(copy.backup);
    if (totalAdded(plan.added) > 0) await applyMerge(plan);
    await markRestoredFromCloud(copy.updatedAt);
    leaveNotice('merged');
    window.dispatchEvent(new Event(NOTICE_EVENT));
  } catch {
    /* quiet: nothing was changed or linked, so it simply tries again next time Thrive opens */
  } finally {
    syncing = false;
  }
}

/** Runs the sync when Thrive opens logged in and right after each login. Renders nothing. */
export default function NewDeviceSync() {
  useEffect(() => {
    if (!cloudAvailable()) return;
    void syncIfNeeded();
    return onSessionChange((s) => {
      if (s) void syncIfNeeded();
    });
  }, []);
  return null;
}
