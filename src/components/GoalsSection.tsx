import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import GoalForm from './GoalForm';
import ConfirmDialog from './ConfirmDialog';
import { deleteGoal, listGoals, saveGoal, setGoalCompleted, type Goal, type GoalDraft } from '../lib/goals';
import { formatShortDay, todayKey } from '../lib/journal';

type Status = 'loading' | 'ready' | 'error';
/** What's open: nothing, the "add" form, or one goal being edited (by id). */
type Editing = null | 'new' | string;

export default function GoalsSection() {
  const [status, setStatus] = useState<Status>('loading');
  const [active, setActive] = useState<Goal[]>([]);
  const [completed, setCompleted] = useState<Goal[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [params, setParams] = useSearchParams();

  // Deep link from Home: /my-life?add=goal opens the "add a goal" form.
  useEffect(() => {
    if (params.get('add') !== 'goal') return;
    setEditing('new');
    setParams({}, { replace: true });
  }, [params, setParams]);

  const refresh = useCallback(async () => {
    try {
      const goals = await listGoals();
      setActive(goals.active);
      setCompleted(goals.completed);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAdd(draft: GoalDraft) {
    await saveGoal(draft);
    setEditing(null);
    setMessage('Goal added.');
    await refresh();
  }

  async function handleEdit(goal: Goal, draft: GoalDraft) {
    await saveGoal(draft, goal);
    setEditing(null);
    setMessage('Goal saved.');
    await refresh();
  }

  async function toggleComplete(goal: Goal) {
    const done = !goal.completedAt;
    await setGoalCompleted(goal, done);
    setEditing(null);
    setMessage(done ? 'Marked complete. Nice work.' : 'Moved back to your active goals.');
    await refresh();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteGoal(confirmDelete.id);
      setEditing(null);
      setMessage('Goal deleted.');
      await refresh();
    } catch {
      setMessage("Couldn't delete this goal. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  function open(next: Editing) {
    setMessage('');
    setEditing(next);
  }

  const renderGoal = (goal: Goal) =>
    editing === goal.id ? (
      <li key={goal.id}>
        <GoalForm
          initial={goal}
          onSave={(draft) => handleEdit(goal, draft)}
          onCancel={() => setEditing(null)}
          extraActions={
            <>
              <button type="button" className="btn-secondary" onClick={() => toggleComplete(goal)}>
                {goal.completedAt ? 'Mark as not done' : 'Mark complete'}
              </button>
              <button type="button" className="btn-danger-outline" onClick={() => setConfirmDelete(goal)}>
                Delete
              </button>
            </>
          }
        />
      </li>
    ) : (
      <li key={goal.id}>
        <button type="button" className={`goal-item${goal.completedAt ? ' done' : ''}`} onClick={() => open(goal.id)}>
          <span className="goal-check" aria-hidden="true">
            {goal.completedAt ? '✓' : ''}
          </span>
          <span className="goal-text">
            <span className="goal-title">{goal.title}</span>
            {goal.note && <span className="goal-note">{goal.note}</span>}
            {goal.completedAt ? (
              <span className="goal-meta">Completed {formatShortDay(todayKey(new Date(goal.completedAt)))}</span>
            ) : (
              goal.targetDate && <span className="goal-meta">Target: {formatShortDay(goal.targetDate)}</span>
            )}
          </span>
          <span className="quick-action-arrow" aria-hidden="true">›</span>
        </button>
      </li>
    );

  return (
    <section className="goals" aria-labelledby="goals-heading">
      <div className="goals-header">
        <h2 id="goals-heading" className="section-title">
          My goals
        </h2>
        {editing !== 'new' && (
          <button type="button" className="btn-secondary btn-small" onClick={() => open('new')}>
            + Add a goal
          </button>
        )}
      </div>

      <p className="save-status" role="status">
        {message}
      </p>

      {editing === 'new' && <GoalForm onSave={handleAdd} onCancel={() => setEditing(null)} />}

      {status === 'loading' && <p className="hint">Loading…</p>}
      {status === 'error' && (
        <p className="form-error" role="alert">
          Couldn't read your goals on this device.
        </p>
      )}

      {status === 'ready' && (
        <>
          {active.length === 0 && editing !== 'new' ? (
            <div className="card placeholder">No active goals. Add one whenever you're ready.</div>
          ) : (
            <ul className="goal-list">{active.map(renderGoal)}</ul>
          )}

          {completed.length > 0 && (
            <details className="goals-completed">
              <summary>Completed ({completed.length})</summary>
              <ul className="goal-list">{completed.map(renderGoal)}</ul>
            </details>
          )}
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this goal?"
          message={`"${confirmDelete.title}" will be removed from this device. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </section>
  );
}
