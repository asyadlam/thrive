import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { JOURNEY_TITLE_MAX, createJourney, journeySummary, listJourneys, type Journey } from '../lib/journeys';
import EmptyState from './EmptyState';

type Status = 'loading' | 'ready' | 'error';

/** The Fear & Confidence area on Growth: my journeys, and a way to start a new one. */
export default function JourneysSection() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listJourneys()
      .then((all) => {
        if (!active) return;
        setJourneys(all);
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give your journey a name, in your own words.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const j = await createJourney(title);
      navigate(`/growth/journeys/${j.id}`);
    } catch {
      setError("Couldn't start this journey. Please try again.");
      setSaving(false);
    }
  }

  return (
    <section className="journeys" aria-labelledby="journeys-heading">
      <div className="goals-header">
        <h2 id="journeys-heading" className="section-title">
          Fear &amp; Confidence
        </h2>
        {!creating && (
          <button type="button" className="btn-secondary btn-small" onClick={() => setCreating(true)}>
            + New journey
          </button>
        )}
      </div>
      <p className="hint habits-hint">Build a ladder of small steps toward something that feels hard.</p>

      {creating && (
        <form className="card positive-form list-create" onSubmit={handleCreate} noValidate>
          <label htmlFor="new-journey-title">What would you like to feel more okay with?</label>
          <input
            id="new-journey-title"
            type="text"
            className="input"
            value={title}
            maxLength={JOURNEY_TITLE_MAX}
            placeholder="e.g. Feeling okay eating out"
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
          />
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
                setTitle('');
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
        <EmptyState>No journeys yet. Start one whenever you feel ready.</EmptyState>
      )}
      {status === 'ready' && journeys.length > 0 && (
        <ul className="list-index">
          {journeys.map((j) => (
            <li key={j.id}>
              <Link to={`/growth/journeys/${j.id}`} className="list-link journey-link">
                <span className="journey-link-text">
                  <span className="list-link-title">{j.title}</span>
                  <span className="journey-summary">{journeySummary(j)}</span>
                </span>
                <span className="quick-action-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
