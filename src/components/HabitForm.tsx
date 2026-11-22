import { useState, type FormEvent, type ReactNode } from 'react';
import { HABIT_FIELD_MAX, type Habit, type HabitDraft } from '../lib/habits';

type Props = {
  initial?: Habit;
  onSave: (draft: HabitDraft) => Promise<void>;
  onCancel: () => void;
  /** Extra button(s) shown when editing (Delete). */
  extraActions?: ReactNode;
};

export default function HabitForm({ initial, onSave, onCancel, extraActions }: Props) {
  const [trigger, setTrigger] = useState(initial?.trigger ?? '');
  const [oldHabit, setOldHabit] = useState(initial?.oldHabit ?? '');
  const [newHabit, setNewHabit] = useState(initial?.newHabit ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBase = initial?.id ?? 'new-habit';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trigger.trim()) return setError('Add the moment this happens, so you know when to use your plan.');
    if (!newHabit.trim()) return setError('Add what you can do instead.');
    setSaving(true);
    setError(null);
    try {
      await onSave({ trigger, oldHabit, newHabit });
    } catch {
      setError("Couldn't save this habit. Please try again.");
      setSaving(false);
    }
  }

  const clearError = () => error && setError(null);

  return (
    <form className="card habit-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${idBase}-trigger`}>When this happens</label>
        <input
          id={`${idBase}-trigger`}
          type="text"
          className="input"
          value={trigger}
          maxLength={HABIT_FIELD_MAX}
          placeholder="e.g. I feel stressed after class"
          autoFocus
          onChange={(e) => {
            setTrigger(e.target.value);
            clearError();
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-old`}>
          I usually <span className="optional">(optional)</span>
        </label>
        <input
          id={`${idBase}-old`}
          type="text"
          className="input"
          value={oldHabit}
          maxLength={HABIT_FIELD_MAX}
          placeholder="e.g. scroll on my phone for an hour"
          onChange={(e) => setOldHabit(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-new`}>Instead, I can</label>
        <input
          id={`${idBase}-new`}
          type="text"
          className="input"
          value={newHabit}
          maxLength={HABIT_FIELD_MAX}
          placeholder="e.g. take a 10-minute walk"
          onChange={(e) => {
            setNewHabit(e.target.value);
            clearError();
          }}
        />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add habit'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      {extraActions && <div className="goal-extra-actions">{extraActions}</div>}
    </form>
  );
}
