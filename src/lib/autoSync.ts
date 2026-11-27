/*
  Automatic cloud sync for signed-in accounts (guest mode never touches any of this).

  1. Bring in the other device's changes: when the app opens (as soon as we know someone is signed in), when it
     comes back to the front, every couple of minutes while it's open, and just before each backup, Thrive checks
     whether the cloud copy changed since it last looked. If it did, the copy is merged in (planSync in merge.ts):
     new things are added, and things both devices have take the more recently saved version, without losing
     anything added here in the meantime. Settings: the more recently changed set wins, as a whole.
     It never blocks the app; if it fails (offline, an error) the app carries on with what's here and tries again.
  2. Back up after changes: a few seconds after the last change (so a burst of edits makes one backup), and when
     the app goes into the background or closes (best effort, as a keepalive request when possible).
  3. Safety: a backup is only sent once this device has seen the newest cloud copy, so it never replaces changes
     from another device it hasn't merged yet. Merging the same copy twice changes nothing.
  4. Quiet: nothing pops up. The only trace is one line on Settings → My data → Cloud backup.
*/
import { onLocalWrite } from './db';
import { SETTINGS_SAVED } from './settings';
import { notifyDataChanged } from './dataEvents';
import {
  backUpToCloud,
  backUpToCloudOnClose,
  cloudAvailable,
  cloudBackupInfo,
  fetchCloudBackup,
  getSession,
  isLinkedDevice,
  isRecovering,
  markRestoredFromCloud,
  onSessionChange,
  recordSync,
} from './cloud';
import { applySync, deviceHasOwnData, planSync, takeNewerSettings } from './merge';

/** Fired when changes from another device were just merged in (the app quietly re-reads its pages). */
export const SYNCED_IN = 'thrive:synced-in';

/** A burst of edits makes one backup, this long after the last one. */
const QUIET_MS = 4000;
/** While the app is open and in front, look for the other device's changes this often. */
const CHECK_EVERY_MS = 2 * 60 * 1000;
/** Coming back to the app looks again if it's been at least this long. */
const RECHECK_AFTER_MS = 30 * 1000;

let started = false;
let userId: string | null = null;
/** The account whose cloud copy this session has merged at least once (backups wait until this is set). */
let mergedFor: string | null = null;
/** The cloud copy this device has seen (merged, or made itself): its saved time. */
let seenCloudAt: string | null = null;
let lastCheck = 0;
/** The same moment? (the server may write a time differently from how it was sent) */
const sameTime = (a: string | null, b: string | null) => !!a && !!b && Date.parse(a) === Date.parse(b);
let merging: Promise<boolean> | null = null;
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
/** True while a merge is writing what came from the cloud. */
let applying = false;
let timer: number | undefined;
let backingUp: Promise<void> | null = null;
let again = false;

/**
 * Fetches the cloud copy and merges it in. Returns true when this device is now up to date with the cloud
 * (merged, or there's nothing there yet); false if it couldn't tell (offline, an error).
 */
function mergeFromCloud(): Promise<boolean> {
  if (merging) return merging;
  merging = (async () => {
    const who = userId;
    if (!who || isRecovering()) return false;
    try {
      const firstTime = mergedFor !== who;
      const copy = await fetchCloudBackup();
      let changes = 0;
      // The first sync of a device that already had its own things: those need to go up to the cloud too.
      const firstWithOwnData = firstTime && !(await isLinkedDevice()) && (await deviceHasOwnData());
      if (copy && !sameTime(copy.updatedAt, seenCloudAt)) {
        const plan = await planSync(copy.backup);
        changes = plan.changes;
        applying = true; // what the merge writes came from the cloud: not a change to send back
        try {
          await applySync(plan);
        } finally {
          applying = false;
        }
        if (changes > 0) {
          notifyDataChanged(); // open pages show what arrived
          window.dispatchEvent(new Event(SYNCED_IN));
        }
        // Settings: the set changed most recently wins, as a whole (never field by field).
        takeNewerSettings(copy.backup);
        await markRestoredFromCloud(copy.updatedAt);
      }
      if (userId !== who) return false; // logged out (or switched) meanwhile
      lastCheck = Date.now();
      if (copy) seenCloudAt = copy.updatedAt;
      mergedFor = who;
      if (readPending()) dirty = true; // changes from earlier that never reached the cloud
      const meta = copy?.backup.meta ?? null;
      recordSync(true, {
        ...(changes ? { added: changes } : {}),
        ...(copy ? { copy: { at: copy.updatedAt, deviceId: meta?.deviceId ?? null, deviceLabel: meta?.deviceLabel ?? '' } } : {}),
      });
      // No cloud copy yet, this device's own things aren't up there yet, or edits are waiting: back up. (What a
      // merge brought in is already in the cloud, so it alone never causes a backup — no ping-pong.)
      if (!copy || firstWithOwnData || dirty) {
        dirty = true;
        schedule();
      }
      return true;
    } catch {
      recordSync(false); // honest line in Settings; nothing here changed, and it tries again later
      return false;
    } finally {
      merging = null;
    }
  })();
  return merging;
}

/**
 * Has the cloud copy changed since this device last saw it? A small request (just its time); the full copy
 * is only fetched and merged when it has. True when this device is up to date afterwards.
 */
async function catchUp(): Promise<boolean> {
  if (!userId) return false;
  if (mergedFor !== userId) return mergeFromCloud();
  try {
    const info = await cloudBackupInfo();
    lastCheck = Date.now();
    if (!info || sameTime(info.updatedAt, seenCloudAt)) return true;
    return mergeFromCloud();
  } catch {
    recordSync(false);
    return false;
  }
}

function schedule(delay = QUIET_MS) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void backUp(false), delay);
}

/** One backup at a time; changes during one make another right after. Never sent over unseen changes. */
async function backUp(closing: boolean): Promise<void> {
  if (!userId || mergedFor !== userId || !dirty) return;
  if (backingUp) {
    again = true;
    return backingUp;
  }
  backingUp = (async () => {
    try {
      // First take in anything the other device backed up meanwhile, so this backup includes it.
      if (!(await catchUp())) throw new Error('not up to date');
      dirty = false;
      seenCloudAt = closing ? await backUpToCloudOnClose() : await backUpToCloud();
      if (!dirty) writePending(false);
    } catch {
      dirty = true; // the changes are still here on the device; the next change, return or open tries again
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
  if (!userId || applying) return; // guest mode, or the merge's own writes: nothing to send
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

/** Back in front (or a regular look while open): bring in the other device's changes. */
function lookAgain(minGap: number) {
  if (!userId || document.visibilityState !== 'visible') return;
  if (Date.now() - lastCheck < minGap) return;
  void catchUp();
}

/** Starts automatic sync once, when the app opens. Does nothing at all when accounts aren't set up. */
export function startAutoSync(): void {
  if (started || !cloudAvailable()) return;
  started = true;
  onLocalWrite(changed);
  window.addEventListener(SETTINGS_SAVED, changed);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leaving();
    else lookAgain(RECHECK_AFTER_MS);
  });
  window.addEventListener('pagehide', leaving);
  window.addEventListener('focus', () => lookAgain(RECHECK_AFTER_MS));
  // Back online after a failed try: catch up without waiting.
  window.addEventListener('online', () => lookAgain(0));
  window.setInterval(() => lookAgain(CHECK_EVERY_MS - 1000), CHECK_EVERY_MS);

  const follow = (id: string | null) => {
    if (id === userId) return;
    userId = id;
    mergedFor = null;
    seenCloudAt = null;
    if (!id) {
      dirty = false;
      writePending(false);
      window.clearTimeout(timer);
      return;
    }
    void mergeFromCloud();
  };
  getSession()
    .then((s) => follow(s?.user.id ?? null))
    .catch(() => undefined);
  onSessionChange((s) => {
    follow(s?.user.id ?? null);
    // A password reset finishing (same account, now allowed to sync): merge if it hasn't happened yet.
    if (s && mergedFor !== s.user.id) void mergeFromCloud();
  });
}
