import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CloudError, lastResetEmail, recoverySession, requestPasswordReset, saveNewPassword, type RecoveryState } from '../lib/cloud';

/**
 * Where a "Forgot password?" email link lands. One calm screen: set a new password (then on to Home, logged in),
 * or — if the link is too old or was already used — a way to send a fresh one. The journal and cloud backup are
 * never touched here: only the password changes.
 */
export default function ResetPassword({ initial, onDone }: { initial: Exclude<RecoveryState, null>; onDone: (signedIn: boolean) => void }) {
  const [screen, setScreen] = useState<'checking' | 'form' | 'saved' | 'expired'>(initial === 'recovery' ? 'checking' : 'expired');

  // The link's login is read by the account code as it starts; no login means the link didn't work.
  useEffect(() => {
    if (initial !== 'recovery') return;
    let active = true;
    void recoverySession().then((s) => active && setScreen(s ? 'form' : 'expired'));
    return () => {
      active = false;
    };
  }, [initial]);

  return (
    <main className="welcome">
      <div className="welcome-inner">
        <img src="/logo-wordmark.png" alt="Thrive" className="welcome-logo" />
        {screen === 'checking' && <div className="app-returning" aria-busy="true" />}
        {(screen === 'form' || screen === 'saved') && <NewPasswordCard saved={screen === 'saved'} onSaved={() => setScreen('saved')} onExpired={() => setScreen('expired')} onDone={() => onDone(true)} />}
        {screen === 'expired' && <ExpiredCard onBack={() => onDone(false)} />}
      </div>
    </main>
  );
}

function NewPasswordCard({ saved, onSaved, onExpired, onDone }: { saved: boolean; onSaved: () => void; onExpired: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setNote('Please use at least 8 characters.');
    if (password !== confirm) return setNote('Those two do not match yet');
    setBusy(true);
    setNote('');
    try {
      await saveNewPassword(password);
      setPassword('');
      setConfirm('');
      onSaved();
      timer.current = window.setTimeout(onDone, 1800); // a moment to read it, then Home
    } catch (err) {
      if (err instanceof CloudError && err.message === 'expired') return onExpired();
      setNote(err instanceof CloudError ? err.message : 'Your new password didn’t save just now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="welcome-note reset-saved" role="status">
        <p>Your password is updated</p>
      </div>
    );
  }
  return (
    <section className="card welcome-card" aria-labelledby="reset-heading">
      <h1 id="reset-heading" className="settings-heading">
        Set a new password
      </h1>
      <p className="hint">Your journal and your cloud backup are tied to your account, not your password, so everything is right where you left it.</p>
      <form className="account-form" onSubmit={(e) => void save(e)} noValidate>
        <div className="field">
          <label htmlFor="reset-new">New password</label>
          <input id="reset-new" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => (setPassword(e.target.value), setNote(''))} />
          <p className="hint">At least 8 characters.</p>
        </div>
        <div className="field">
          <label htmlFor="reset-confirm">Confirm new password</label>
          <input id="reset-confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => (setConfirm(e.target.value), setNote(''))} />
        </div>
        {note && (
          <p className="hint account-reset-note" role="status">
            {note}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </div>
      </form>
    </section>
  );
}

function ExpiredCard({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState(lastResetEmail);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setNote('Enter your email, then tap Send a new link.');
    setBusy(true);
    try {
      setNote(await requestPasswordReset(email));
    } catch (err) {
      setNote(err instanceof CloudError ? err.message : 'That didn’t go through just now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card welcome-card" aria-labelledby="reset-expired-heading">
      <h1 id="reset-expired-heading" className="settings-heading">
        This link has expired
      </h1>
      <p className="hint">Reset links only work for a little while. You can send yourself a fresh one.</p>
      <form className="account-form" onSubmit={(e) => void send(e)} noValidate>
        <div className="field">
          <label htmlFor="reset-email">Email</label>
          <input id="reset-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => (setEmail(e.target.value), setNote(''))} />
        </div>
        {note && (
          <p className="hint account-reset-note" role="status">
            {note}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'One moment…' : 'Send a new link'}
          </button>
        </div>
        <button type="button" className="saving-toggle account-switch" onClick={onBack}>
          Back to Thrive
        </button>
      </form>
    </section>
  );
}
