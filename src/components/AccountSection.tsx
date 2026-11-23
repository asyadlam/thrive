import { useEffect, useState, type FormEvent } from 'react';
import { CloudError, cloudAvailable, getSession, logIn, logOut, onSessionChange, signUp } from '../lib/cloud';

/**
 * Settings → Account: optional email + password account for cloud backup. Logged out, Thrive stays fully local;
 * nothing here is ever required.
 */
export default function AccountSection() {
  const [email, setEmail] = useState<string | null>(null); // signed-in email, or null
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [formEmail, setFormEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

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
        setMessage(result === 'confirm' ? 'Almost there: check your email for a link to confirm your account, then log in here.' : 'Your account is ready.');
        if (result === 'confirm') setMode('login');
      } else {
        await logIn(formEmail, password);
        setMessage('You’re logged in.');
      }
      setPassword('');
    } catch (err) {
      setError(err instanceof CloudError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function out() {
    setBusy(true);
    try {
      await logOut();
      setMessage('Logged out. Everything on this device is still here.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card settings-section" aria-labelledby="account-heading">
      <h2 id="account-heading" className="settings-heading">
        Account
      </h2>

      {!cloudAvailable() ? (
        <p className="hint">Accounts aren't set up for this version of Thrive. Everything works on this device without one.</p>
      ) : !checked ? (
        <p className="hint">Loading…</p>
      ) : email ? (
        <>
          <p className="hint">
            Logged in as <strong className="account-email">{email}</strong>. You can back up to the cloud in My data below.
          </p>
          <div className="data-actions">
            <button type="button" className="btn-secondary" onClick={() => void out()} disabled={busy}>
              {busy ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Optional. An account lets you keep a cloud backup of your Thrive. Without one, everything stays on this device, just as it
            does now.
          </p>
          <form className="account-form" onSubmit={(e) => void submit(e)} noValidate>
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
          </form>
        </>
      )}
      <p className="save-status" role="status">
        {message}
      </p>
    </section>
  );
}
