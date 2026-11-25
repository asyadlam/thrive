import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PetCompanion from '../components/PetCompanion';
import { SYNC_NOTICE_TEXT, onSyncNotice, takeSyncNotice, type SyncNotice } from '../components/NewDevicePrompt';
import { getQuickEntry, todayKey } from '../lib/journal';
import { affirmationOfTheDay, positiveOfTheDay, timeGreeting } from '../lib/homeData';
import type { AffirmationItem } from '../lib/affirmations';
import type { PositiveItem } from '../lib/positives';
import { loadSettings } from '../lib/settings';

export default function Home() {
  const [{ userName, companion }] = useState(loadSettings);
  const [affirmation, setAffirmation] = useState<AffirmationItem | null>(null);
  const [positive, setPositive] = useState<PositiveItem | null>(null);
  // Today's check-in said Rough or Low: the greeting pet is comforting for the rest of the day.
  const [comforting, setComforting] = useState(false);
  // One small line after a login brought the cloud backup here (shown once, dismissible).
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(takeSyncNotice);
  useEffect(() => onSyncNotice(() => setSyncNotice(takeSyncNotice())), []);

  useEffect(() => {
    let active = true;
    affirmationOfTheDay().then((a) => active && setAffirmation(a));
    positiveOfTheDay()
      .then((p) => active && setPositive(p))
      .catch(() => active && setPositive(null));
    if (companion !== 'none') {
      getQuickEntry(todayKey())
        .then((q) => active && setComforting(q?.mood === 'Rough' || q?.mood === 'Low'))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, []);

  const name = userName.trim();
  const greeting = <h1 className="home-greeting">{name ? `${timeGreeting()}, ${name}` : timeGreeting()}</h1>;

  return (
    <section className="page home">
      {/* 1. Centered greeting (with the pet above it, if one is chosen) */}
      <div className="home-hero">{companion === 'none' ? greeting : <PetCompanion pose={comforting ? 'comforting' : 'default'}>{greeting}</PetCompanion>}</div>

      {syncNotice && (
        <p className="home-sync-note" role="status">
          <span>{SYNC_NOTICE_TEXT[syncNotice]}</span>
          <button type="button" className="home-sync-close" aria-label="Dismiss" onClick={() => setSyncNotice(null)}>
            ×
          </button>
        </p>
      )}

      {/* 2. My daily little sprout */}
      <Link to="/sprout" className="home-checkin">
        <span className="home-checkin-title">My daily little sprout</span>
        <span className="home-checkin-sub">One small page for today</span>
      </Link>

      {/* 3. Today's affirmation — opens the Affirmations page */}
      {affirmation && (
        <Link to="/affirmations" className="home-card home-card-link">
          <span className="home-card-label">Today's affirmation</span>
          <p className="home-quote">{affirmation.text}</p>
          <span className="home-caption">tap for more affirmations</span>
        </Link>
      )}

      {/* 4. A positive to remember — only if I have one */}
      {positive && (
        <Link to="/growth?section=positives" className="home-card home-card-link">
          <span className="home-card-label">A positive to remember</span>
          <p className="home-quote">{positive.text}</p>
          <span className="home-caption">from your Positives · tap to see more</span>
        </Link>
      )}
    </section>
  );
}
