import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GOAL_LIMITS } from '../lib/goals';
import { JOURNEY_TITLE_MAX, createJourney, listJourneys, type Journey } from '../lib/journeys';
import EmptyState from './EmptyState';
import { SeeMore, newestFirst, previewOf, useSectionAnchor } from './ListPreview';

type Status = 'loading' | 'ready' | 'error';

/** "3 of 6 steps tried" — only when the journey has steps. */
function progress(j: Journey): string {
  if (j.steps.length === 0) return '';
  const tried = j.steps.filter((s) => s.triedAt).length;
  return `${tried} of ${j.steps.length} ${j.steps.length === 1 ? 'step' : 'steps'} tried`;
}

/**
 * Growth's Journeys: each one thing I'm working on, with its goal, small steps and habits to change.
 * Shows the newest 3 (with "See more"); `full` is the page listing them all.
 */
export default function JourneysSection({ full = false }: { full?: boolean }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useSectionAnchor('journeys', sectionRef);

  useEffect(() => {
    let active = true;
    listJourneys()
      .then((all) => {
        if (!active) return;
        setJourneys(newestFirst(all));
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give your journey a name, in your own words.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const journey = await createJourney(name, goal);
      navigate(`/growth/journeys/${journey.id}`); // add steps and habits right there
    } catch {
      setError("Couldn't start this journey. Please try again.");
      setSaving(false);
    }
  }

  return (
    <section className="journeys" aria-labelledby="journeys-heading" ref={sectionRef}>
      <div className="goals-header">
        <h2 id="journeys-heading" className={full ? 'sr-only' : 'section-title'}>
          Journeys
        </h2>
        {!creating && (
          <button type="button" className="btn-secondary btn-small" onClick={() => setCreating(true)}>
            + Add a journey
          </button>
        )}
      </div>

      {creating && (
        <form className="card positive-form list-create" onSubmit={handleCreate} noValidate>
          <div className="field">
            <label htmlFor="new-journey-title">What are you working on?</label>
            <input
              id="new-journey-title"
              type="text"
              className="input"
              value={name}
              maxLength={JOURNEY_TITLE_MAX}
              placeholder="e.g. Feeling okay at social events"
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="new-journey-goal">
              The goal <span className="optional">(optional)</span>
            </label>
            <input
              id="new-journey-goal"
              type="text"
              className="input"
              value={goal}
              maxLength={GOAL_LIMITS.title}
              placeholder="e.g. Go to one party and stay an hour"
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Starting…' : 'Start journey'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => {
                setCreating(false);
                setName('');
                setGoal('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {status === 'loading' && <p className="hint">Loading…</p>}
      {status === 'error' && (
        <p className="form-error" role="alert">
          Couldn't read your journeys on this device.
        </p>
      )}
      {status === 'ready' && journeys.length === 0 && !creating && (
        <EmptyState>
          No journeys yet. A journey is one thing you're working on — with a goal, small steps, and the habits that get in
          the way, all in one place.
        </EmptyState>
      )}
      {status === 'ready' && journeys.length > 0 && (
        <ul className="list-index">
          {previewOf(journeys, full).map((j) => (
            <li key={j.id}>
              <Link to={`/growth/journeys/${j.id}`} className="list-link journey-link">
                <span className="journey-link-text">
                  <span className="list-link-title">{j.title}</span>
                  {j.goal && (
                    <span className="journey-goal-line">
                      <span aria-hidden="true">🎯</span> {j.goal.title}
                      {j.goal.completedAt && ' · reached 🎉'}
                    </span>
                  )}
                  {progress(j) && <span className="journey-summary">{progress(j)}</span>}
                </span>
                <span className="quick-action-arrow" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!full && journeys.length > 3 && <SeeMore to="/growth/journeys" a11yLabel="See all your journeys" />}
    </section>
  );
}
