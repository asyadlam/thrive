import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import DreamsSection from '../components/DreamsSection';
import HealthSection from '../components/HealthSection';
import { loadSettings } from '../lib/settings';
import { CalendarIcon, LetterIcon, MyLifeIcon } from '../components/icons';
import { formatTime, listTalkEntries, talkEntryLabel, todayKey, type TalkEntry } from '../lib/journal';

export default function Journal() {
  const date = useMemo(() => todayKey(), []);
  const [talkEntries, setTalkEntries] = useState<TalkEntry[]>([]);
  const [{ showHealth, showDreams }] = useState(loadSettings);

  useEffect(() => {
    let active = true;
    listTalkEntries(date)
      .then((talks) => {
        if (!active) return;
        setTalkEntries(talks);
      })
      .catch(() => undefined); // the entry pages themselves explain storage problems
    return () => {
      active = false;
    };
  }, [date]);

  return (
    <PageShell title="Journal" subtitle="A space for your thoughts and reflections." pet>
      <h2 className="section-title">What would help right now?</h2>

      <div className="choice-list">
        <Link to="/journal/talk" className="card choice-card">
          <span className="quick-action-icon talk-icon">
            <MyLifeIcon />
          </span>
          <span className="quick-action-text">
            <strong>Need to talk about it</strong>
            <span>A blank page to write as much as you need.</span>
          </span>
          <span className="quick-action-arrow" aria-hidden="true">›</span>
        </Link>
      </div>

      <Link to="/journal/look-back" className="card choice-card look-back-card">
        <span className="quick-action-icon look-back-icon">
          <CalendarIcon />
        </span>
        <span className="quick-action-text">
          <strong>Look back</strong>
          <span>See past entries on a calendar.</span>
        </span>
        <span className="quick-action-arrow" aria-hidden="true">›</span>
      </Link>


      {talkEntries.length > 0 && (
        <>
          <h2 className="section-title talk-list-title">Written today</h2>
          <ul className="talk-list">
            {talkEntries.map((t) => (
              <li key={t.id}>
                <Link to={`/journal/talk/${t.id}`} className="talk-list-item">
                  <span className="talk-list-label">{talkEntryLabel(t)}</span>
                  <span className="hint">{formatTime(t.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr className="journal-divider" />

      {showDreams && <DreamsSection />}
      {showHealth && <HealthSection />}
      <Link to="/journal/time-capsule" className="card choice-card look-back-card time-capsule-card">
        <span className="quick-action-icon look-back-icon">
          <LetterIcon />
        </span>
        <span className="quick-action-text">
          <strong>Time Capsule</strong>
          <span>Write a letter to future me.</span>
        </span>
        <span className="quick-action-arrow" aria-hidden="true">›</span>
      </Link>
    </PageShell>
  );
}
