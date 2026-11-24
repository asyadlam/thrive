import { useEffect, useState, type FormEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import {
  CloudError,
  GOOGLE_FAILED_MESSAGE,
  cloudAvailable,
  deleteAccount,
  getSession,
  logIn,
  logOut,
  onSessionChange,
  signInWithGoogle,
  signUp,
  takeGoogleFailure,
} from '../lib/cloud';

/**
 * The email + password form (Log in, or "New here? Create an account"). Used in Settings → Account and on the
 * one-time Welcome screen. `onSignedIn` runs once the person is logged in.
 */
export function AccountForm({ onSignedIn, googleBack = '/' }: { onSignedIn?: () => void; googleBack?: '/' | '/settings' }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [google, setGoogle] = useState(false);
  // Back from a Google sign-in that didn't finish: say so once, in plain words.
  const [error, setError] = useState<string | null>(takeGoogleFailure);

  async function continueWithGoogle() {
    setGoogle(true);
    setError(null);
    try {
      await signInWithGoogle(googleBack); // leaves for Google; the app picks up again when it comes back
    } catch {
      setGoogle(false);
      setError(GOOGLE_FAILED_MESSAGE);
    }
  }

  const [formEmail, setFormEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!formEmail.trim() || !/^\S+@\S+\.\S+$/.test(formEmail.trim())) return setError('Please enter your email address.');
    if (password.length < 8) return setError('Please use a password of at least 8 characters.');
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      if (mode === 'signup') {
        const result = await signUp(formEmail, password);
        setPassword('');
        if (result === 'confirm') {
          setMessage('Almost there: check your email for a link to confirm your account, then log in here.');
          setMode('login');
        } else {
          setMessage('Your account is ready.');
          onSignedIn?.();
        }
      } else {
        await logIn(formEmail, password);
        setPassword('');
        setMessage('You’re logged in.');
        onSignedIn?.();
      }
    } catch (err) {
      setError(err instanceof CloudError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={(e) => void submit(e)} noValidate>
      <button type="button" className="google-btn" onClick={() => void continueWithGoogle()} disabled={google || busy}>
        <svg viewBox="0 0 48 48" aria-hidden="true" className="google-mark">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        <span>{google ? 'Opening Google…' : 'Continue with Google'}</span>
      </button>
      <div className="account-or" aria-hidden="true">
        <span>or use your email</span>
      </div>
      <div className="field">
        <label htmlFor="account-email">Email</label>
        <input
          id="account-email"
          className="input"
          type="email"
          autoComplete="email"
          value={formEmail}
          onChange={(e) => (setFormEmail(e.target.value), setError(null))}
        />
      </div>
      <div className="field">
        <label htmlFor="account-password">Password</label>
        <input
          id="account-password"
          className="input"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => (setPassword(e.target.value), setError(null))}
        />
        {mode === 'signup' && <p className="hint">At least 8 characters.</p>}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </div>
      <button
        type="button"
        className="saving-toggle account-switch"
        onClick={() => {
          setMode((m) => (m === 'login' ? 'signup' : 'login'));
          setError(null);
          setMessage('');
        }}
      >
        {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
      </button>
      <p className="save-status" role="status">
        {message}
      </p>
    </form>
  );
}

/**
 * Settings → Account: optional email + password account for cloud backup. Logged out, Thrive stays fully local;
 * nothing here is ever required.
 */
export default function AccountSection() {
  const [email, setEmail] = useState<string | null>(null); // signed-in email, or null
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSession()
      .then((s) => {
        if (!active) return;
        setEmail(s?.user.email ?? null);
        setChecked(true);
      })
      .catch(() => active && setChecked(true));
    const stop = onSessionChange((s) => active && setEmail(s?.user.email ?? null));
    return () => {
      active = false;
      stop();
    };
  }, []);

  async function out() {
    setBusy(true);
    try {
      await logOut();
      setMessage('Logged out. Everything on this device is still here.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      setConfirmDelete(false);
      setEmail(null);
      setMessage('Your account and cloud backup are deleted.');
    } catch (err) {
      setConfirmDelete(false);
      setDeleteError(err instanceof CloudError ? err.message : 'Your account couldn’t be deleted just now. Nothing was changed — please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="card settings-section" aria-labelledby="account-heading">
      <h2 id="account-heading" className="settings-heading">
        Account
      </h2>
      {(checked || !cloudAvailable()) && (
        <p className="account-status" role="status">
          {email ? (
            <>
              Signed in as <strong className="account-email">{email}</strong>
            </>
          ) : (
            'Device only, no account.'
          )}
        </p>
      )}

      {!cloudAvailable() ? (
        <p className="hint">Accounts aren't set up for this version of Thrive. Everything works on this device without one.</p>
      ) : !checked ? (
        <p className="hint">Loading…</p>
      ) : email ? (
        <>
          <div className="data-actions">
            <button type="button" className="btn-secondary" onClick={() => void out()} disabled={busy}>
              {busy ? 'Logging out…' : 'Log out'}
            </button>
          </div>
          <div className="account-delete">
            <button type="button" className="account-delete-link" onClick={() => (setDeleteError(null), setConfirmDelete(true))} disabled={busy || deleting}>
              Delete account
            </button>
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="hint">Optional. An account keeps a cloud backup of your Thrive.</p>
          <AccountForm onSignedIn={() => setMessage('')} googleBack="/settings" />
        </>
      )}
      {message && (
        <p className="save-status" role="status">
          {message}
        </p>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete your account?"
          message="This deletes your account and your cloud backup. The copy of your journal on this device stays, and Thrive keeps working locally. This cannot be undone."
          confirmLabel="Delete my account"
          busy={deleting}
          busyLabel="Deleting…"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
