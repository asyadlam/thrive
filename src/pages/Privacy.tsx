import PageShell from '../components/PageShell';

/** Where questions about privacy go. Replace the placeholder with your real contact address. */
const CONTACT_EMAIL = 'thrive.safespace@gmail.com';

/**
 * /privacy — a short, plain-words privacy page. Reachable from the Welcome screen footer (shown on its own, before
 * any choice is made) and from the bottom of Settings (inside the app).
 */
export default function Privacy({ fromWelcome = false }: { fromWelcome?: boolean }) {
  const isEmail = /^\S+@\S+\.\S+$/.test(CONTACT_EMAIL);
  return (
    <PageShell title="Privacy" subtitle="What happens with your Thrive, in plain words." back={fromWelcome ? { to: '/', label: 'Back' } : { to: '/settings', label: 'Settings' }}>
      <div className="card privacy-card">
        <section>
          <h2>Your journal</h2>
          <p>Your journal lives on your device. Thrive works fully without an account.</p>
        </section>
        <section>
          <h2>If you create an account</h2>
          <p>It is your email and a password, used only to sign you in.</p>
        </section>
        <section>
          <h2>If you back up to the cloud</h2>
          <p>
            A copy of your journal is stored in Thrive's database so you can restore it on another device. It is never sold, never used for
            ads, and never shared.
          </p>
        </section>
        <section>
          <h2>"Talk about this" and dictation</h2>
          <p>
            Both are optional. Only when you use them, the words you choose to share are sent to Thrive's AI provider to write the reply or
            the transcript. Nothing is sent otherwise.
          </p>
        </section>
        <section>
          <h2>Leaving</h2>
          <p>You can delete your account and your cloud backup anytime in Settings → Account. The copy on your device stays yours.</p>
        </section>
        <section>
          <h2>Questions</h2>
          <p>{isEmail ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : CONTACT_EMAIL}</p>
        </section>
      </div>
    </PageShell>
  );
}
