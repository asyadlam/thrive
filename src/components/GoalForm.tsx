import { useState, type FormEvent, type ReactNode } from 'react';
import { GOAL_LIMITS, type Goal, type GoalDraft } from '../lib/goals';

type Props = {
  initial?: Goal;
  onSave: (draft: GoalDraft) => Promise<void>;
  onCancel: () => void;
  /** Extra buttons shown under Save/Cancel when editing (complete, delete). */
  extraActions?: ReactNode;
};

export default function GoalForm({ initial, onSave, onCancel, extraActions }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBase = initial?.id ?? 'new-goal';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give your goal a title to save it.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ title, note, targetDate });
    } catch {
      setError("Couldn't save this goal. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form className="card goal-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${idBase}-title`}>Goal</label>
        <input
          id={`${idBase}-title`}
          type="text"
          className="input"
          value={title}
          maxLength={GOAL_LIMITS.title}
          placeholder="e.g. Walk outside three times a week"
          autoFocus
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-note`}>
          Why it matters to me <span className="optional">(optional)</span>
        </label>
        <textarea
          id={`${idBase}-note`}
          className="input goal-note-input"
          rows={2}
          value={note}
          maxLength={GOAL_LIMITS.note}
          placeholder="A line or two, just for you"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-date`}>
          Target date <span className="optional">(optional)</span>
        </label>
        <div className="goal-date-row">
          <input
            id={`${idBase}-date`}
            type="date"
            className="input goal-date-input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          {targetDate && (
            <button type="button" className="btn-link" onClick={() => setTargetDate('')}>
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add goal'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      {extraActions && <div className="goal-extra-actions">{extraActions}</div>}
    </form>
  );
}
