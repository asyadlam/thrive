import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from './EmptyState';
import { SeeMore, useSectionAnchor } from './ListPreview';
import { DREAMS_BASE } from '../lib/book';
import { formatShortDay, listAllEntries, talkEntryLabel, type JournalEntry } from '../lib/journal';

/** Newest first: by the day it was written, then by time. */
const newest = (a: JournalEntry, b: JournalEntry) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/**
 * Dreams & Nightmares on the Journal tab: dream entries (stored apart from journal entries) and a way to write one.
 * Each opens the same writing page as a journal page, with the same opt-in "Talk about this".
 */
export default function DreamsSection({ full = false }: { full?: boolean }) {
  const [dreams, setDreams] = useState<JournalEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  useSectionAnchor('dreams', sectionRef);

  useEffect(() => {
    let active = true;
    listAllEntries('dreams')
      .then((all) => active && setDreams([...all].sort(newest)))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="dreams" aria-labelledby="dreams-heading" ref={sectionRef}>
      <div className="goals-header">
        <h2 id="dreams-heading" className={full ? 'sr-only' : 'section-title'}>
          Dreams &amp; Nightmares
        </h2>
        <Link to={`${DREAMS_BASE}/talk`} className="btn-secondary btn-small">
          + Write a dream
        </Link>
      </div>
      {!full && <p className="hint habits-hint">What your nights bring you.</p>}

      {failed && (
        <p className="form-error" role="alert">
          Couldn't read your dreams on this device.
        </p>
      )}
      {dreams && dreams.length === 0 && <EmptyState>Nothing here yet. When a dream stays with you, write it down here.</EmptyState>}
      {dreams && dreams.length > 0 && (
        <ul className="list-index">
          {(full ? dreams : dreams.slice(0, 1)).map((d) => ( // on the Journal tab: just the latest
            <li key={d.id}>
              <Link to={d.type === 'talk' ? `${DREAMS_BASE}/talk/${d.id}` : `${DREAMS_BASE}/entry/${d.id}`} className="list-link">
                <span className="list-link-main">
                  <span className="list-link-title">{d.type === 'talk' ? talkEntryLabel(d) : 'Quick entry'}</span>
                  <span className="list-link-meta">{formatShortDay(d.date)}</span>
                </span>
                <span className="quick-action-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!full && dreams && dreams.length > 1 && (
        <SeeMore to={DREAMS_BASE} label={`See all ${dreams.length}`} a11yLabel="See all your dreams" />
      )}
    </section>
  );
}
