import PageShell from '../components/PageShell';

/*
  Get help. Plain links only: no forms, no tracking, nothing stored or logged when this page opens or a button is
  tapped. Big tap targets for shaky hands.
  Text links use "?&body=" so the message is started on both iPhone and Android.
*/

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.6 3.5h2.6l1.4 4-2 1.3a12 12 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Help() {
  return (
    <PageShell title="Get help" subtitle="If things feel like too much right now, you do not have to carry this alone." pet petPose="comforting">
      <div className="card help-card">
        <div className="help-action">
          <div className="help-action-text">
            <strong>Call or text 988</strong>
            <span>Suicide and Crisis Lifeline (US). Free, day or night.</span>
          </div>
          <div className="help-action-pair">
            <a className="help-tap" href="tel:988" aria-label="Call 988">
              <PhoneIcon />
              Call
            </a>
            <a className="help-tap" href="sms:988" aria-label="Text 988">
              <TextIcon />
              Text
            </a>
          </div>
        </div>

        <a className="help-action help-action-link" href="sms:741741?&body=HOME" aria-label="Text HOME to 741741, Crisis Text Line">
          <span className="help-action-icon">
            <TextIcon />
          </span>
          <span className="help-action-text">
            <strong>Text HOME to 741741</strong>
            <span>Crisis Text Line. For when talking out loud is too much.</span>
          </span>
        </a>

        <a className="help-action help-action-link help-urgent" href="tel:911" aria-label="Call 911">
          <span className="help-action-icon">
            <PhoneIcon />
          </span>
          <span className="help-action-text">
            <strong>Call 911</strong>
            <span>If you or someone else is in immediate danger.</span>
          </span>
        </a>
      </div>

      <div className="card help-quiet">
        <strong>Outside the US?</strong>
        <p>
          <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">
            findahelpline.com
          </a>{' '}
          lists free helplines by country.
        </p>
      </div>

      <p className="help-closing">Thrive is a journal, not a crisis service. Reaching out to a person is always allowed.</p>
    </PageShell>
  );
}
