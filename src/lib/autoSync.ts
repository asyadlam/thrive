/*
  Automatic cloud sync for signed-in accounts (guest mode never touches any of this).

  1. Merge on open: once per session, as soon as we know someone is signed in, the cloud backup is fetched and
     merged in with the same rules as "Add a file to my data": things whose ids aren't on this device are added,
     nothing here is overwritten or removed, settings are not merged. It never blocks the app; if it fails
     (offline, an error) the app simply carries on with what's here and tries again next time (or when the
     connection comes back).
  2. Back up after changes: a few seconds after the last change (so a burst of edits makes one backup), and when
     the app goes into the background or closes (best effort, as a keepalive request when possible).
  3. Safety: backups only run after this session's merge has worked, so a device that couldn't read the cloud
     copy never replaces it with less. Merging the same backup twice changes nothing (it's by id).
  4. Quiet: nothing pops up. The only trace is one line on Settings → My data → Cloud backup.
*/
import { onLocalWrite } from './db';
import { SETTINGS_SAVED } from './settings';
import { notifyDataChanged } from './dataEvents';
import {
  backUpToCloud,
  backUpToCloudOnClose,
  cloudAvailable,
  fetchCloudBackup,
  getSession,
  isRecovering,
  markRestoredFromCloud,
  onSessionChange,
  recordSync,
} from './cloud';
import { applyMerge, planMerge, totalAdded } from './merge';

/** A burst of edits makes one backup, this long after the last one. */
const QUIET_MS = 4000;

let started = false;
let userId: string | null = null;
/** The account whose cloud copy was merged in this session (backups wait until this is set). */
let mergedFor: string | null = null;
let merging = false;
/**
 * Something changed here since the last backup. Also remembered on the device, so a change made offline (or
 * right before the app was closed) is backed up next session even if nothing else changes.
 */
const PENDING_KEY = 'thrive.cloudPending';
const readPending = () => {
  try {
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
};
const writePending = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PENDING_KEY, '1');
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* then it just waits for the next change */
  }
};
let dirty = false;
let timer: number | undefined;
let backingUp: Promise<void> | null = null;
let again = false;

/** Fetches the cloud backup and adds whatever isn't on this device yet. Quiet either way. */
async function mergeOnOpen(): Promise<void> {
  const who = userId;
  if (!who || merging || mergedFor === who || isRecovering()) return;
  merging = true;
  try {
    const copy = await fetchCloudBackup();
    let added = 0;
    if (copy) {
      const plan = await planMerge(copy.backup);
      added = totalAdded(plan.added);
      if (added > 0) {
        await applyMerge(plan);
        notifyDataChanged(); // open pages show what arrived
      }
      await markRestoredFromCloud(copy.updatedAt);
    }
    if (userId !== who) return; // logged out (or switched) meanwhile
    mergedFor = who;
    if (readPending()) dirty = true; // changes from last time that never reached the cloud
    recordSync(true, added);
    // No cloud copy yet, something arrived, or edits were waiting: back up so the cloud has the full picture.
    if (!copy || added > 0 || dirty) {
      dirty = true;
      schedule();
    }
  } catch {
    recordSync(false); // honest line in Settings; nothing here changed, and it tries again later
  } finally {
    merging = false;
  }
}

function schedule(delay = QUIET_MS) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void backUp(false), delay);
}

/** One backup at a time; changes during one make another right after. */
async function backUp(closing: boolean): Promise<void> {
  if (!userId || mergedFor !== userId || !dirty) return;
  if (backingUp) {
    again = true;
    return backingUp;
  }
  dirty = false;
  backingUp = (async () => {
    try {
      if (closing) await backUpToCloudOnClose();
      else await backUpToCloud();
      if (!dirty) writePending(false);
    } catch {
      dirty = true; // the changes are still here on the device; the next change, close or open tries again
      writePending(true);
      recordSync(false);
    } finally {
      backingUp = null;
      if (again) {
        again = false;
        schedule(1000);
      }
    }
  })();
  return backingUp;
}

/** Something was saved on this device. */
function changed() {
  if (!userId) return; // guest mode: nothing to do
  dirty = true;
  writePending(true);
  if (mergedFor === userId) schedule();
}

/** Going into the background or closing: back up now if anything is waiting. */
function leaving() {
  if (!userId || !dirty || mergedFor !== userId) return;
  window.clearTimeout(timer);
  void backUp(true);
}

/** Starts automatic sync once, when the app opens. Does nothing at all when accounts aren't set up. */
export function startAutoSync(): void {
  if (started || !cloudAvailable()) return;
  started = true;
  onLocalWrite(changed);
  window.addEventListener(SETTINGS_SAVED, changed);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leaving();
  });
  window.addEventListener('pagehide', leaving);
  // Back online after a failed merge: try again without waiting for the next open.
  window.addEventListener('online', () => void mergeOnOpen());

  const follow = (id: string | null) => {
    if (id === userId) return;
    userId = id;
    if (!id) {
      mergedFor = null;
      dirty = false;
      writePending(false);
      window.clearTimeout(timer);
      return;
    }
    void mergeOnOpen();
  };
  getSession()
    .then((s) => follow(s?.user.id ?? null))
    .catch(() => undefined);
  onSessionChange((s) => {
    follow(s?.user.id ?? null);
    // A password reset finishing (same account, now allowed to sync): merge if it hasn't happened yet.
    if (s && mergedFor !== s.user.id) void mergeOnOpen();
  });
}
