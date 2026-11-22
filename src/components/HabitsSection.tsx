import { useCallback, useEffect, useRef, useState } from 'react';
import HabitForm from './HabitForm';
import ConfirmDialog from './ConfirmDialog';
import { deleteHabit, listHabits, saveHabit, type Habit, type HabitDraft } from '../lib/habits';
import EmptyState from './EmptyState';
import { SeeMore, newestFirst, previewOf, useSectionAnchor } from './ListPreview';

type Status = 'loading' | 'ready' | 'error';
/** What's open: nothing, the "add" form, or one habit being edited (by id). */
type Editing = null | 'new' | string;

/** Habit swaps. On My Life it shows the 3 newest; `full` (the Habits page) shows them all. */
export default function HabitsSection({ full = false }: { full?: boolean }) {
  const [status, setStatus] = useState<Status>('loading');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const sectionRef = useRef<HTMLElement>(null);
  useSectionAnchor('habits', sectionRef);

  const refresh = useCallback(async () => {
    try {
      setHabits(newestFirst(await listHabits()));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAdd(draft: HabitDraft) {
    await saveHabit(draft);
    setEditing(null);
    setMessage('Habit added.');
    await refresh();
  }

  async function handleEdit(habit: Habit, draft: HabitDraft) {
    await saveHabit(draft, habit);
    setEditing(null);
    setMessage('Habit saved.');
    await refresh();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteHabit(confirmDelete.id);
      setEditing(null);
      setMessage('Habit deleted.');
      await refresh();
    } catch {
      setMessage("Couldn't delete this habit. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  function open(next: Editing) {
    setMessage('');
    setEditing(next);
  }

  return (
    <section className="habits" aria-labelledby="habits-heading" ref={sectionRef}>
      <div className="goals-header">
        <h2 id="habits-heading" className={full ? 'sr-only' : 'section-title'}>
          Habits
        </h2>
        {editing !== 'new' && (
          <button type="button" className="btn-secondary btn-small" onClick={() => open('new')}>
            + Add a habit
          </button>
        )}
      </div>
      {!full && <p className="hint habits-hint">Small swaps to try when a familiar moment comes up.</p>}

      <p className="save-status" role="status">
        {message}
      </p>

      {editing === 'new' && <HabitForm onSave={handleAdd} onCancel={() => setEditing(null)} />}

      {status === 'loading' && <p className="hint">Loading…</p>}
      {status === 'error' && (
        <p className="form-error" role="alert">
          Couldn't read your habits on this device.
        </p>
      )}

      {status === 'ready' && habits.length === 0 && editing !== 'new' && (
        <EmptyState>No habits yet. Add a swap whenever one comes to mind.</EmptyState>
      )}

      {status === 'ready' && habits.length > 0 && (
        <ul className="habit-list">
          {previewOf(habits, full).map((habit) =>
            editing === habit.id ? (
              <li key={habit.id}>
                <HabitForm
                  initial={habit}
                  onSave={(draft) => handleEdit(habit, draft)}
                  onCancel={() => setEditing(null)}
                  extraActions={
                    <button type="button" className="btn-danger-outline" onClick={() => setConfirmDelete(habit)}>
                      Delete
                    </button>
                  }
                />
              </li>
            ) : (
              <li key={habit.id}>
                <button
                  type="button"
                  className="habit-card"
                  aria-label={`Edit habit: when ${habit.trigger}, instead I can ${habit.newHabit}`}
                  onClick={() => open(habit.id)}
                >
                  <span className="habit-row">
                    <span className="habit-label">When this happens</span>
                    <span className="habit-value">{habit.trigger}</span>
                  </span>
                  {habit.oldHabit && (
                    <span className="habit-row">
                      <span className="habit-label">I usually</span>
                      <span className="habit-value habit-old">{habit.oldHabit}</span>
                    </span>
                  )}
                  <span className="habit-row habit-swap">
                    <span className="habit-label">Instead, I can</span>
                    <span className="habit-value">{habit.newHabit}</span>
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {!full && habits.length > 3 && <SeeMore to="/my-life/habits" a11yLabel="See all your habits" />}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this habit?"
          message={`"When ${confirmDelete.trigger}" will be removed from this device. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </section>
  );
}
