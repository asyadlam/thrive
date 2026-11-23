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

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TABLE = 'cloud_backups';

/** Local notes about cloud backups on this device (never the data itself). */
const LAST_CLOUD_KEY = 'thrive.lastCloudBackupAt';
/** The account this device has backed up to or restored from — automatic backups only run for that account. */
const LINKED_KEY = 'thrive.cloudLinkedUser';
const DAY_MS = 24 * 60 * 60 * 1000;
/** The one-time Welcome choice on this device: 'account' (logged in here at least once) or 'local'. */
const WELCOME_KEY = 'thrive.welcomeChoice';

/**
 * Show the Welcome screen? Only when accounts are set up, nobody has ever logged in on this device, and
 * "Continue without an account" was never chosen here. Synchronous, so the app never flashes the wrong screen.
 */
export function needsWelcome(): boolean {
  if (!cloudAvailable()) return false;
  try {
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
  } catch {
    /* nothing to forget */
  }
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
  const { data, error } = await sb.from(TABLE).select('updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw friendly(error, 'Couldn’t check your cloud backup. Please try again.');
  if (data?.updated_at) remember(LAST_CLOUD_KEY, data.updated_at);
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

/**
 * The quiet daily backup, run when the app opens while logged in. To never overwrite a good cloud copy with an
 * empty or unrelated device, it only runs on a device that has already backed up to, or restored from, this
 * same account — and only when the last cloud backup is more than a day old. Never shows anything.
 */
export async function autoCloudBackup(): Promise<void> {
  try {
    if (!recall(LINKED_KEY)) return; // never linked on this device: don't even load the account code
    const session = await getSession();
    if (!session || recall(LINKED_KEY) !== session.user.id) return;
    const last = recall(LAST_CLOUD_KEY);
    if (last && Date.now() - Date.parse(last) < DAY_MS) return;
    await backUpToCloud();
  } catch {
    /* quiet: it tries again next time the app opens */
  }
}
