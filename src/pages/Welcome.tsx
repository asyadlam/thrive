import { AccountForm } from '../components/AccountSection';
import { rememberWelcomeChoice } from '../lib/cloud';

/**
 * The one-time Welcome screen (shown before Home only until the person logs in or chooses local-only use on this
 * device — see needsWelcome in lib/cloud.ts). Never shown again after either choice.
 */
export default function Welcome({ onDone }: { onDone: () => void }) {
  function continueLocal() {
    rememberWelcomeChoice('local');
    onDone();
  }

  return (
    <main className="welcome">
      <div className="welcome-inner">
        <img src="/logo-wordmark.png" alt="Thrive" className="welcome-logo" />
        <p className="welcome-greeting">Welcome. This is a calm, private space for you.</p>

        <section className="card welcome-card" aria-labelledby="welcome-account">
          <h1 id="welcome-account" className="settings-heading">
            Log in or create an account
          </h1>
          <p className="hint">An account keeps a cloud backup of your Thrive, so you can restore it on another device.</p>
          <AccountForm onSignedIn={onDone} />
        </section>

        <div className="welcome-local">
          <button type="button" className="btn-secondary welcome-local-btn" onClick={continueLocal}>
            Continue without an account
          </button>
          <p className="hint">
            Local only means everything stays on this device. There is no cloud backup, and if this device is lost, your journal cannot be
            restored. You can create an account anytime in Settings.
          </p>
        </div>
      </div>
    </main>
  );
}
