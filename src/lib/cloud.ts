/*
  Optional accounts and cloud BACKUP (not live sync), using Supabase.

  - Logged out, nothing here runs and Thrive stays fully local.
  - The local database is always the working copy. A cloud backup is one full copy of the same data as the
    "Download backup" file, stored per account (one row per user in `cloud_backups`, protected by Row Level
    Security so each account can only ever read or write its own row).
  - The Supabase URL and anon key are public by design (they're meant to be in the browser); what keeps each
    account's data private is Row Level Security, not the key.
*/
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { buildBackup, checkBackup, type CheckedBackup } from './backup';
import { deviceId, deviceLabel, readBackupMeta } from './device';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TABLE = 'cloud_backups';

/** Local notes about cloud backups on this device (never the data itself). */
const LAST_CLOUD_KEY = 'thrive.lastCloudBackupAt';
/** The account this device has backed up to or restored from — automatic backups only run for that account. */
const LINKED_KEY = 'thrive.cloudLinkedUser';
/** The one-time Welcome choice on this device: 'account' (logged in here at least once) or 'local'. */
const WELCOME_KEY = 'thrive.welcomeChoice';
/** Set right after an explicit Log out or Delete account: the Welcome screen shows (once) as a doorway. */
const WELCOME_AGAIN_KEY = 'thrive.welcomeAgain';
/** Fired to bring up the Welcome screen straight away (App listens for it). */
export const WELCOME_EVENT = 'thrive:welcome';
export type WelcomeReason = 'logout' | 'deleted';

/** Why the Welcome screen is being shown again (null on a first open). */
export function welcomeReason(): WelcomeReason | null {
  try {
    const v = localStorage.getItem(WELCOME_AGAIN_KEY);
    return v === 'logout' || v === 'deleted' ? v : null;
  } catch {
    return null;
  }
}

/** After Log out / Delete account: show the Welcome screen now (it stays until a choice is made on it). */
function welcomeAgain(reason: WelcomeReason) {
  try {
    localStorage.setItem(WELCOME_AGAIN_KEY, reason);
  } catch {
    /* the screen still shows now; it just won't be remembered across a reload */
  }
  window.dispatchEvent(new CustomEvent(WELCOME_EVENT, { detail: reason }));
}

/**
 * Show the Welcome screen? Only when accounts are set up, nobody has ever logged in on this device, and
 * "Continue without an account" was never chosen here. Synchronous, so the app never flashes the wrong screen.
 */
export function needsWelcome(): boolean {
  if (!cloudAvailable()) return false;
  try {
    if (welcomeReason()) return true; // right after Log out / Delete account, until a choice is made
    if (localStorage.getItem(WELCOME_KEY)) return false;
    // Already logged in here (Supabase keeps its session in a "sb-…-auth-token" entry): open straight to Home.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return false;
    }
    return true;
  } catch {
    return false; // storage unavailable: never block the app
  }
}

/** Remembers the Welcome choice on this device, so the Welcome screen never shows again. */
export function rememberWelcomeChoice(choice: 'account' | 'local'): void {
  try {
    // Logging in always wins over an earlier "local" choice; "local" never replaces "account".
    if (choice === 'account' || !localStorage.getItem(WELCOME_KEY)) localStorage.setItem(WELCOME_KEY, choice);
    localStorage.removeItem(WELCOME_AGAIN_KEY); // a choice was made: back to the normal first-open rule
  } catch {
    /* nothing to remember */
  }
}

let client: Promise<SupabaseClient> | null = null;

/** True when this build has Supabase settings (otherwise the Account section explains accounts aren't set up). */
export const cloudAvailable = () => Boolean(URL && ANON_KEY);

/** The Supabase client, loaded only when an account feature is used (so the app itself stays small and fast). */
export async function supabase(): Promise<SupabaseClient | null> {
  if (!cloudAvailable()) return null;
  if (!client) {
    client = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(URL!, ANON_KEY!, { auth: { persistSession: true, autoRefreshToken: true } }),
    );
    client.catch(() => (client = null));
  }
  return client;
}

/** A plain-words error for the person (never the raw technical text). */
export class CloudError extends Error {}

function friendly(err: unknown, fallback: string): CloudError {
  const msg = String((err as { message?: string } | null)?.message ?? '').toLowerCase();
  if (msg.includes('invalid login')) return new CloudError('That email and password don’t match an account.');
  if (msg.includes('already registered') || msg.includes('already been registered')) return new CloudError('There’s already an account with that email. Try logging in.');
  if (msg.includes('password') && (msg.includes('at least') || msg.includes('short') || msg.includes('weak'))) return new CloudError('Please choose a longer password (at least 8 characters).');
  if (msg.includes('email') && msg.includes('invalid')) return new CloudError('That email address doesn’t look right.');
  if (msg.includes('email not confirmed')) return new CloudError('Please confirm your email first — check your inbox for the link, then log in.');
  if (msg.includes('rate limit') || msg.includes('too many')) return new CloudError('Too many tries just now. Please wait a minute and try again.');
  if (msg.includes('fetch') || msg.includes('network')) return new CloudError('Couldn’t reach the cloud. Check your connection and try again.');
  return new CloudError(fallback);
}

/* ---------------- Account ---------------- */

export async function getSession(): Promise<Session | null> {
  const sb = await supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export function onSessionChange(cb: (session: Session | null) => void): () => void {
  let stop = () => undefined as void;
  let stopped = false;
  void supabase().then((sb) => {
    if (!sb || stopped) return;
    const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
    stop = () => data.subscription.unsubscribe();
  });
  return () => {
    stopped = true;
    stop();
  };
}

/** Creates an account. Returns 'confirm' when the person must confirm their email before logging in. */
export async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm'> {
  const sb = await supabase();
  if (!sb) throw new CloudError('Accounts aren’t set up for this app yet.');
  const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
  if (error) throw friendly(error, 'Couldn’t create your account. Please try again.');
  // Supabase answers an existing email with a user that has no identities (so it doesn't reveal accounts).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new CloudError('There’s already an account with that email. Try logging in.');
  }
  if (data.session) rememberWelcomeChoice('account');
  return data.session ? 'signed-in' : 'confirm';
}

export async function logIn(email: string, password: string): Promise<void> {
  const sb = await supabase();
  if (!sb) throw new CloudError('Accounts aren’t set up for this app yet.');
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw friendly(error, 'Couldn’t log in. Please try again.');
  rememberWelcomeChoice('account');
}

/** Logs out. Everything on this device stays exactly as it is. */
export async function logOut(): Promise<void> {
  const sb = await supabase();
  if (!sb) return;
  await sb.auth.signOut();
  try {
    localStorage.removeItem(LAST_CLOUD_KEY);
    localStorage.removeItem(LINKED_KEY);
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* nothing to forget */
  }
  welcomeAgain('logout');
}

/* ---------------- Cloud backup ---------------- */

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* only a convenience */
  }
}
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const getLastCloudBackupAt = () => recall(LAST_CLOUD_KEY);

/** True when this device has already backed up to, or restored from, the logged-in account. */
export async function isLinkedDevice(): Promise<boolean> {
  const session = await getSession();
  return !!session && recall(LINKED_KEY) === session.user.id;
}

async function requireUser(): Promise<{ sb: SupabaseClient; userId: string }> {
  const sb = await supabase();
  const session = await getSession();
  if (!sb || !session) throw new CloudError('Please log in first.');
  return { sb, userId: session.user.id };
}

/** When this account's cloud copy was last saved (null if there isn't one yet). */
export async function cloudBackupInfo(): Promise<{ updatedAt: string } | null> {
  const { sb, userId } = await requireUser();
  const { data, error } = await sb.from(TABLE).select('updated_at, meta:data->meta').eq('user_id', userId).maybeSingle();
  if (error) throw friendly(error, 'Couldn’t check your cloud backup. Please try again.');
  if (data?.updated_at) {
    remember(LAST_CLOUD_KEY, data.updated_at);
    const meta = readBackupMeta((data as { meta?: unknown }).meta);
    noteCloudCopy({ at: data.updated_at as string, deviceId: meta?.deviceId ?? null, deviceLabel: meta?.deviceLabel ?? '' });
  }
  return data ? { updatedAt: data.updated_at as string } : null;
}

/** Uploads a full copy of everything (the same as the Download backup file), replacing this account's cloud copy. */
export async function backUpToCloud(): Promise<string> {
  const { sb, userId } = await requireUser();
  const backup = await buildBackup();
  const updatedAt = new Date().toISOString();
  const { error } = await sb.from(TABLE).upsert({ user_id: userId, data: backup, updated_at: updatedAt }, { onConflict: 'user_id' });
  if (error) throw friendly(error, 'Couldn’t back up to the cloud. Your data is safe on this device — please try again.');
  remember(LAST_CLOUD_KEY, updatedAt);
  remember(LINKED_KEY, userId);
  recordSync(true, { copy: madeHere(updatedAt) });
  return updatedAt;
}

/** Downloads and checks this account's cloud copy (nothing on this device changes yet). */
export async function fetchCloudBackup(): Promise<{ backup: CheckedBackup; updatedAt: string } | null> {
  const { sb, userId } = await requireUser();
  const { data, error } = await sb.from(TABLE).select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw friendly(error, 'Couldn’t download your cloud backup. Please try again.');
  if (!data) return null;
  let backup: CheckedBackup;
  try {
    backup = checkBackup(data.data);
  } catch {
    throw new CloudError('Your cloud backup couldn’t be read. Nothing on this device was changed.');
  }
  return { backup, updatedAt: data.updated_at as string };
}

/** After a cloud restore: this device now follows this account (so daily automatic backups can run). */
export async function markRestoredFromCloud(updatedAt: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  remember(LINKED_KEY, session.user.id);
  remember(LAST_CLOUD_KEY, updatedAt);
}

/* ---------------- Sync status (the one quiet line on the Cloud backup card) ---------------- */

const SYNC_KEY = 'thrive.cloudSync';
const SYNC_EVENT = 'thrive:cloud-sync-status';
/**
 * The last sync: when it was tried and whether it worked, how many things a merge on open added (mentioned for a
 * day), and the newest cloud backup this device knows of: when it was made and on which device.
 */
export type SyncStatus = {
  at: string;
  ok: boolean;
  added: number;
  addedAt?: string;
  backupAt?: string;
  backupDeviceId?: string;
  backupDeviceLabel?: string;
};
/** The newest cloud backup: when, and on which device (id and platform label). */
export type CloudCopyInfo = { at: string; deviceId: string | null; deviceLabel: string };

export function readSyncStatus(): SyncStatus | null {
  try {
    const v = JSON.parse(recall(SYNC_KEY) ?? 'null') as Partial<SyncStatus> | null;
    if (!v || typeof v.at !== 'string' || typeof v.ok !== 'boolean') return null;
    const fresh = typeof v.addedAt === 'string' && Date.now() - Date.parse(v.addedAt) < 24 * 60 * 60 * 1000;
    return {
      at: v.at,
      ok: v.ok,
      added: fresh ? Number(v.added) || 0 : 0,
      ...(fresh ? { addedAt: v.addedAt } : {}),
      ...(typeof v.backupAt === 'string' ? { backupAt: v.backupAt } : {}),
      ...(typeof v.backupDeviceId === 'string' ? { backupDeviceId: v.backupDeviceId } : {}),
      ...(typeof v.backupDeviceLabel === 'string' ? { backupDeviceLabel: v.backupDeviceLabel } : {}),
    };
  } catch {
    return null;
  }
}

function writeSyncStatus(next: SyncStatus) {
  remember(SYNC_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SYNC_EVENT));
}

/**
 * Records a sync result. `added` is only given by a merge on open; `copy` is the newest cloud backup it saw or
 * made. Anything not given is kept from before.
 */
export function recordSync(ok: boolean, info: { added?: number; copy?: CloudCopyInfo } = {}): void {
  const before = readSyncStatus();
  const now = new Date().toISOString();
  // A merge that added things is mentioned for a day (later opens that add nothing don't hide it).
  const added =
    info.added && info.added > 0
      ? { added: info.added, addedAt: now }
      : { added: before?.added ?? 0, ...(before?.addedAt ? { addedAt: before.addedAt } : {}) };
  const copy = info.copy
    ? { backupAt: info.copy.at, ...(info.copy.deviceId ? { backupDeviceId: info.copy.deviceId } : {}), backupDeviceLabel: info.copy.deviceLabel }
    : {
        ...(before?.backupAt ? { backupAt: before.backupAt } : {}),
        ...(before?.backupDeviceId ? { backupDeviceId: before.backupDeviceId } : {}),
        ...(before?.backupDeviceLabel ? { backupDeviceLabel: before.backupDeviceLabel } : {}),
      };
  writeSyncStatus({ at: ok ? now : (before?.at ?? now), ok, ...added, ...copy });
}

/** Just updates which cloud backup is newest (when Settings checks), without counting it as a sync. */
function noteCloudCopy(copy: CloudCopyInfo) {
  const before = readSyncStatus();
  writeSyncStatus({
    at: before?.at ?? copy.at,
    ok: before?.ok ?? true,
    added: before?.added ?? 0,
    ...(before?.addedAt ? { addedAt: before.addedAt } : {}),
    backupAt: copy.at,
    ...(copy.deviceId ? { backupDeviceId: copy.deviceId } : {}),
    backupDeviceLabel: copy.deviceLabel,
  });
}

/** The cloud copy info for a backup this device just made. */
const madeHere = (at: string): CloudCopyInfo => ({ at, deviceId: deviceId(), deviceLabel: deviceLabel() });

export function onSyncStatus(cb: () => void): () => void {
  window.addEventListener(SYNC_EVENT, cb);
  return () => window.removeEventListener(SYNC_EVENT, cb);
}

/** Keepalive requests (they can finish after the page closes) are limited to about 64 KB by browsers. */
const KEEPALIVE_MAX = 60 * 1024;

/** A backup ready to send at once (built ahead, so leaving the app doesn't have to wait for it). */
export type PreparedBackup = { userId: string; token: string; data: string; at: string };

/** Builds a backup ready to send, for the signed-in account (null when not signed in). */
export async function prepareBackup(): Promise<PreparedBackup | null> {
  const session = await getSession();
  if (!session) return null;
  const at = new Date().toISOString();
  return { userId: session.user.id, token: session.access_token, data: JSON.stringify(await buildBackup()), at };
}

export type UploadResult = 'saved' | 'conflict';

/**
 * Sends a prepared backup — but only over the cloud copy this device has already seen (`seenAt`), so it can
 * never replace changes from another device that haven't been merged here yet: if the cloud copy changed in the
 * meantime, nothing is written and this says 'conflict'. With no cloud copy yet (`seenAt` null) it creates one.
 * `keepalive` lets the request finish after the app closes (when it's small enough for browsers to allow it).
 * The request is started straight away, before anything else is awaited.
 */
export async function uploadBackup(prep: PreparedBackup, seenAt: string | null, keepalive = false): Promise<UploadResult> {
  if (!URL || !ANON_KEY) throw new CloudError('Accounts aren’t set up for this app yet.');
  const base = `${URL.replace(/\/+$/, '')}/rest/v1/${TABLE}`;
  const body = seenAt
    ? `{"data":${prep.data},"updated_at":${JSON.stringify(prep.at)}}`
    : `{"user_id":${JSON.stringify(prep.userId)},"data":${prep.data},"updated_at":${JSON.stringify(prep.at)}}`;
  const res = await fetch(
    seenAt
      ? `${base}?user_id=eq.${encodeURIComponent(prep.userId)}&updated_at=eq.${encodeURIComponent(seenAt)}&select=user_id`
      : `${base}?on_conflict=user_id&select=user_id`,
    {
      method: seenAt ? 'PATCH' : 'POST',
      keepalive: keepalive && body.length <= KEEPALIVE_MAX,
      headers: {
        apikey: ANON_KEY,
        authorization: `Bearer ${prep.token}`,
        'content-type': 'application/json',
        prefer: seenAt ? 'return=representation' : 'resolution=ignore-duplicates,return=representation',
      },
      body,
    },
  );
  if (!res.ok) throw new CloudError('Couldn’t back up to the cloud.');
  // The rows written come back: none means the cloud copy changed since this device saw it (or, for a first
  // backup, one already exists) — nothing was replaced.
  const rows = (await res.json().catch(() => [])) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) return 'conflict';
  remember(LAST_CLOUD_KEY, prep.at);
  remember(LINKED_KEY, prep.userId);
  recordSync(true, { copy: madeHere(prep.at) });
  return 'saved';
}

/**
 * Permanently deletes this account and its cloud backup (done on the server by /api/delete-account, which checks
 * the login token and only deletes that user). The copy on this device stays. Afterwards this device is logged out.
 */
export async function deleteAccount(): Promise<void> {
  const sb = await supabase();
  const session = await getSession();
  if (!sb || !session) throw new CloudError('Please log in first.');
  let res: Response;
  try {
    res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    throw new CloudError('Couldn’t reach Thrive just now. Nothing was deleted — please check your connection and try again.');
  }
  if (!res.ok) {
    throw new CloudError(
      res.status === 401
        ? 'Your login has expired. Please log out and log in again, then try once more. Nothing was deleted.'
        : 'Your account couldn’t be deleted just now. Nothing was changed — please try again in a moment.',
    );
  }
  // The account is gone on the server: forget the login on this device only (the server session no longer exists).
  await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
  try {
    localStorage.removeItem(LAST_CLOUD_KEY);
    localStorage.removeItem(LINKED_KEY);
  } catch {
    /* nothing to forget */
  }
  welcomeAgain('deleted');
}

/* ---------------- Forgot password ---------------- */

/*
  Supabase's built-in reset: we ask it to email a link; the link brings the person back to /reset-password with a
  short-lived login in the address ("type=recovery"), or with an error if the link is too old or already used.
  The address is read once, as Thrive starts, before the account code can tidy it away.
*/

/** The reset link's way back into Thrive (it must be on Supabase's list of allowed redirect URLs). */
export const RESET_PATH = '/reset-password';
/** Set when a reset is requested on this device (holds the email), so a too-old link can offer a fresh one. */
const RESET_ASKED_KEY = 'thrive.resetAsked';
export const RESET_SENT_MESSAGE = 'If an account matches that email, a reset link is on its way. It can take a few minutes.';

export type RecoveryState = 'recovery' | 'expired' | null;

function readLaunchRecovery(): RecoveryState {
  if (typeof window === 'undefined') return null;
  const { hash, search, pathname } = window.location;
  const params = new URLSearchParams(`${search.slice(1)}&${hash.replace(/^#/, '')}`);
  if (params.get('type') === 'recovery' && params.get('access_token')) return 'recovery';
  const code = params.get('error_code') ?? '';
  const error = params.get('error') ?? '';
  const onResetPath = pathname === RESET_PATH;
  if (onResetPath && (error || code)) return 'expired';
  if (code === 'otp_expired' && recall(RESET_ASKED_KEY) !== null) return 'expired'; // came back to the home address instead
  return null;
}

/** What the reset link brought, read once at start: a recovery login, a too-old link, or nothing. */
let launchRecovery: RecoveryState = readLaunchRecovery();
export const recoveryAtLaunch = (): RecoveryState => launchRecovery;
/** While the "Set a new password" screen is open: other account work (like the new-device sync) waits. */
export const isRecovering = () => launchRecovery === 'recovery';

/** The email a reset was last asked for on this device ('' if none), to fill in the "send a new one" field. */
export const lastResetEmail = () => recall(RESET_ASKED_KEY) ?? '';

/** Leaves the reset screens: tidies the address so the link's details aren't left in it. */
export function finishRecovery(): void {
  launchRecovery = null;
  if (window.location.hash || window.location.search || window.location.pathname === RESET_PATH) {
    window.history.replaceState(null, '', '/');
  }
}

/**
 * Asks Supabase to email a reset link. Says the same thing whether or not an account (or a Google-only account)
 * matches the email; only a connection problem or too many tries gets its own plain message.
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const sb = await supabase();
  if (!sb) throw new CloudError('Accounts aren’t set up for this app yet.');
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${RESET_PATH}` });
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    const status = (error as { status?: number }).status;
    if (status === 429 || msg.includes('rate limit') || msg.includes('security purposes') || msg.includes('too many')) {
      throw new CloudError('A link was just sent. Please wait a minute before asking for another.');
    }
    if (msg.includes('fetch') || msg.includes('network')) throw new CloudError('Couldn’t reach the cloud. Check your connection and try again.');
  }
  remember(RESET_ASKED_KEY, email.trim());
  return RESET_SENT_MESSAGE;
}

/**
 * From the reset link: is there a usable recovery login? Supabase reads it from the address when the account code
 * starts. Null means the link didn't work (too old or already used).
 */
export async function recoverySession(): Promise<Session | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

/** Saves the new password for the person the reset link logged in. */
export async function saveNewPassword(password: string): Promise<void> {
  const sb = await supabase();
  if (!sb) throw new CloudError('Accounts aren’t set up for this app yet.');
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('different from the old') || msg.includes('same password')) throw new CloudError('That’s your current password. Please choose a new one.');
    if (msg.includes('session') || msg.includes('jwt') || msg.includes('expired') || msg.includes('not authenticated')) throw new CloudError('expired');
    throw friendly(error, 'Your new password didn’t save just now. Please try again.');
  }
  forget(RESET_ASKED_KEY);
  rememberWelcomeChoice('account');
}

/* ---------------- Continue with Google ---------------- */

/** Set just before leaving for Google; holds where to come back to ("/" or "/settings"). */
const GOOGLE_PENDING_KEY = 'thrive.googlePending';
/** Set when a Google sign-in didn't finish, so the form can say so once. */
const GOOGLE_FAILED_KEY = 'thrive.googleFailed';
export const GOOGLE_FAILED_MESSAGE = 'Google sign-in didn’t finish. You can try again, or use your email instead.';

/** True while we're coming back from Google (the app waits a moment before showing anything). */
export const hasGooglePending = () => !!recall(GOOGLE_PENDING_KEY);

/** Leaves for Google's sign-in page; Supabase brings the person back to `back` in this app. */
export async function signInWithGoogle(back: '/' | '/settings'): Promise<void> {
  const sb = await supabase();
  if (!sb) throw new CloudError('Accounts aren’t set up for this app yet.');
  remember(GOOGLE_PENDING_KEY, back);
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${back}` },
  });
  if (error) {
    forget(GOOGLE_PENDING_KEY);
    throw new CloudError(GOOGLE_FAILED_MESSAGE);
  }
}

function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to forget */
  }
}

/**
 * Back from Google: let Supabase read the result from the address, then either the person is logged in (exactly
 * like an email login) or the sign-in didn't finish (cancelled or failed) and the form will say so.
 */
export async function completeGoogleSignIn(): Promise<'signed-in' | 'failed'> {
  forget(GOOGLE_PENDING_KEY);
  let ok = false;
  try {
    ok = !!(await getSession());
  } catch {
    ok = false;
  }
  // Tidy the address: no tokens or error details left in it.
  if (window.location.hash || window.location.href.endsWith('#') || /[?&](error|code)=/.test(window.location.search)) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  if (ok) {
    rememberWelcomeChoice('account');
    return 'signed-in';
  }
  remember(GOOGLE_FAILED_KEY, '1');
  return 'failed';
}

/** The "didn't finish" message, shown once by the account form after a failed Google sign-in. */
export function takeGoogleFailure(): string | null {
  if (!recall(GOOGLE_FAILED_KEY)) return null;
  forget(GOOGLE_FAILED_KEY);
  return GOOGLE_FAILED_MESSAGE;
}
