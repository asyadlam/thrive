import { useState, type FormEvent, type ReactNode } from 'react';
import { SAVE_FAILED } from '../lib/messages';
import { HABIT_FIELD_MAX, type Habit, type HabitDraft } from '../lib/habits';

/** Example hints for the three parts of the sentence. */
export type SwapExamples = { trigger: string; oldHabit: string; newHabit: string };
const PHONE_EXAMPLE: SwapExamples = {
  trigger: 'e.g. I get into bed with my phone',
  oldHabit: 'e.g. scroll until 1am',
  newHabit: 'e.g. leave my phone charging in the kitchen and read two pages',
};

/** A saved swap, shown as the little plan it is: When… / usually… / Instead, I'll try… */
export function SwapSentence({ trigger, oldHabit, newHabit }: { trigger: string; oldHabit: string; newHabit: string }) {
  return (
    <>
      <span className="swap-line">
        <span className="swap-word">When</span> {trigger}
      </span>
      {oldHabit && (
        <span className="swap-line swap-usually">
          <span className="swap-word">… I usually</span> {oldHabit}
        </span>
      )}
      <span className="swap-line swap-instead">
        <span className="swap-word">… Instead, I’ll try</span> {newHabit}
      </span>
    </>
  );
}

type Props = {
  initial?: Habit;
  /** The grey example hints (defaults to the phone example). */
  examples?: SwapExamples;
  onSave: (draft: HabitDraft) => Promise<void>;
  onCancel: () => void;
  /** Extra button(s) shown when editing (Delete). */
  extraActions?: ReactNode;
};

/**
 * A habit swap, written as one guided sentence:
 * "When [the moment] … I usually [what I do now] … Instead, I'll try [one tiny swap]."
 * (Saved in the same fields as before: trigger, oldHabit, newHabit.)
 */
export default function HabitForm({ initial, examples = PHONE_EXAMPLE, onSave, onCancel, extraActions }: Props) {
  const [trigger, setTrigger] = useState(initial?.trigger ?? '');
  const [oldHabit, setOldHabit] = useState(initial?.oldHabit ?? '');
  const [newHabit, setNewHabit] = useState(initial?.newHabit ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBase = initial?.id ?? 'new-habit';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trigger.trim()) return setError('Add the moment — "When…" — so you know when to use your plan.');
    if (!newHabit.trim()) return setError('Add one tiny thing to try instead.');
    setSaving(true);
    setError(null);
    try {
      await onSave({ trigger, oldHabit, newHabit });
    } catch {
      setError(SAVE_FAILED);
      setSaving(false);
    }
  }

  const clearError = () => error && setError(null);

  return (
    <form className="card habit-form swap-form" onSubmit={handleSubmit} noValidate>
      <div className="swap-sentence">
        <label htmlFor={`${idBase}-trigger`} className="swap-word">
          When
        </label>
        <input
          id={`${idBase}-trigger`}
          type="text"
          className="input"
          value={trigger}
          maxLength={HABIT_FIELD_MAX}
          placeholder={examples.trigger}
          autoFocus
          onChange={(e) => {
            setTrigger(e.target.value);
            clearError();
          }}
        />
        <label htmlFor={`${idBase}-old`} className="swap-word">
          … I usually <span className="optional">(optional)</span>
        </label>
        <input
          id={`${idBase}-old`}
          type="text"
          className="input"
          value={oldHabit}
          maxLength={HABIT_FIELD_MAX}
          placeholder={examples.oldHabit}
          onChange={(e) => setOldHabit(e.target.value)}
        />
        <label htmlFor={`${idBase}-new`} className="swap-word">
          … Instead, I’ll try
        </label>
        <input
          id={`${idBase}-new`}
          type="text"
          className="input"
          value={newHabit}
          maxLength={HABIT_FIELD_MAX}
          placeholder={examples.newHabit}
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
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add swap'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      {extraActions && <div className="goal-extra-actions">{extraActions}</div>}
    </form>
  );
}
