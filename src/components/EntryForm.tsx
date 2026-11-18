import { useState, type FormEvent } from 'react';
import { LIMITS, MAX_POSITIVES, MOODS, type Mood, type QuickDraft, type QuickEntry } from '../lib/journal';

type Props = {
  initial?: QuickEntry;
  onSave: (draft: QuickDraft) => Promise<void>;
  onCancel?: () => void;
};

export default function EntryForm({ initial, onSave, onCancel }: Props) {
  const [mood, setMood] = useState<Mood | null>(initial?.mood ?? null);
  const [positives, setPositives] = useState<string[]>(() => {
    const p = initial?.positives ?? [];
    return p.length ? [...p] : [''];
  });
  const [note, setNote] = useState(initial?.note ?? '');
  const [intention, setIntention] = useState(initial?.intention ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePositive = (i: number, value: string) =>
    setPositives((prev) => prev.map((p, idx) => (idx === i ? value : p)));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mood) {
      setError('Pick a mood to save your entry.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ mood, positives, note, intention });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while saving.');
      setSaving(false);
    }
  }

  return (
    <form className="card entry-form" onSubmit={handleSubmit} noValidate>
      <fieldset className="field">
        <legend>How are you feeling?</legend>
        <div className="mood-grid" role="radiogroup">
          {MOODS.map((m) => (
            <label key={m} className="mood-chip">
              <input
                type="radio"
                name="mood"
                value={m}
                checked={mood === m}
                onChange={() => {
                  setMood(m);
                  setError(null);
                }}
              />
              <span>{m}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>One positive</legend>
        <p className="hint">Something good from today, big or small. Up to {MAX_POSITIVES} short lines.</p>
        {positives.map((p, i) => (
          <input
            key={i}
            type="text"
            className="input"
            value={p}
            maxLength={LIMITS.positive}
            aria-label={`Positive, line ${i + 1}`}
            placeholder={i === 0 ? 'e.g. Had a good chat with a friend' : 'Another good thing'}
            onChange={(e) => updatePositive(i, e.target.value)}
          />
        ))}
        {positives.length < MAX_POSITIVES && (
          <button type="button" className="btn-link" onClick={() => setPositives((prev) => [...prev, ''])}>
            + Add a line
          </button>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="entry-note">Short note</label>
        <textarea
          id="entry-note"
          className="input"
          rows={3}
          value={note}
          maxLength={LIMITS.note}
          placeholder="A line or two about today…"
          aria-describedby="entry-note-count"
          onChange={(e) => setNote(e.target.value)}
        />
        <span id="entry-note-count" className="hint char-count">
          {note.length}/{LIMITS.note}
        </span>
      </div>

      <div className="field">
        <label htmlFor="entry-intention">Tomorrow's intention</label>
        <input
          id="entry-intention"
          type="text"
          className="input"
          value={intention}
          maxLength={LIMITS.intention}
          placeholder="e.g. Take a short walk at lunch"
          onChange={(e) => setIntention(e.target.value)}
        />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Save'}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
