import { useState, type FormEvent } from 'react';
import { SAVE_FAILED } from '../lib/messages';
import { LIMITS, MOODS, type Mood, type QuickDraft, type QuickEntry } from '../lib/journal';
import DictationButton from './DictationButton';

type Props = {
  initial?: QuickEntry;
  onSave: (draft: QuickDraft) => Promise<void>;
  onCancel?: () => void;
};

export default function EntryForm({ initial, onSave, onCancel }: Props) {
  const [mood, setMood] = useState<Mood | null>(initial?.mood ?? null);
  // Quick entries no longer ask for a positive (that lives in Growth → Positives). Positives saved on older
  // entries are kept exactly as they were when the entry is edited.
  const positives = initial?.positives ?? [];
  const [note, setNote] = useState(initial?.note ?? '');
  const [intention, setIntention] = useState(initial?.intention ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      void err;
      setError(SAVE_FAILED);
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


      <div className="field">
        <DictationButton value={note} onChange={setNote} maxLength={LIMITS.note} label="your note">
          <label htmlFor="entry-note">Short note</label>
        </DictationButton>
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
