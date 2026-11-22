import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatLongDay, todayKey } from '../lib/journal';
import GoalForm from '../components/GoalForm';
import HabitForm, { SwapSentence } from '../components/HabitForm';
import type { Habit } from '../lib/habits';
import {
  JOURNEY_TITLE_MAX,
  deleteJourneySwap,
  removeJourneyGoal,
  saveJourneyGoal,
  saveJourneySwap,
  setJourneyGoalReached,
  REFLECTION_MAX,
  STEP_MAX,
  addStep,
  deleteJourney,
  deleteStep,
  editStep,
  getJourney,
  journeySummary,
  markTried,
  moveStep,
  renameJourney,
  saveReflection,
  unmarkTried,
  type Journey,
  type JourneyStep,
} from '../lib/journeys';
import EmptyState from '../components/EmptyState';

type Status = 'loading' | 'ready' | 'missing' | 'error';
type Confirm =
  | { kind: 'journey' }
  | { kind: 'swap'; swap: Habit }
  | { kind: 'step'; step: JourneyStep }
  | { kind: 'unmark'; step: JourneyStep }
  | null;

const triedDay = (iso: string) => formatLongDay(todayKey(new Date(iso)));

/** Example hints for a habit swap inside a journey. */
const SWAP_EXAMPLES = {
  trigger: 'e.g. plans change at the last minute',
  oldHabit: 'e.g. cancel everything',
  newHabit: 'e.g. take ten minutes, then decide',
};

export default function JourneyPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [newStep, setNewStep] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [reflecting, setReflecting] = useState<string | null>(null);
  const [reflection, setReflection] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const addInput = useRef<HTMLInputElement>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [editingSwap, setEditingSwap] = useState<null | 'new' | string>(null);

  useEffect(() => {
    let active = true;
    getJourney(id)
      .then((j) => {
        if (!active) return;
        setJourney(j ?? null);
        setStatus(j ? 'ready' : 'missing');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [id]);

  // Every change saves straight away; show the saved version.
  async function apply(change: (j: Journey) => Promise<Journey>) {
    if (!journey) return false;
    try {
      setJourney(await change(journey));
      setFailed('');
      return true;
    } catch {
      setFailed("Couldn't save that change. Please try again.");
      return false;
    }
  }

  async function handleAddStep(e: FormEvent) {
    e.preventDefault();
    if (!newStep.trim()) {
      setStepError('Describe the step in a few words.');
      return;
    }
    const text = newStep;
    setNewStep('');
    setStepError(null);
    await apply((j) => addStep(j, text));
    addInput.current?.focus();
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError('Give your journey a name.');
      return;
    }
    if (await apply((j) => renameJourney(j, title))) setRenaming(false);
  }

  async function handleTried(step: JourneyStep) {
    if (await apply((j) => markTried(j, step.id))) {
      setReflection('');
      setReflecting(step.id); // optional "How did it go?"
    }
  }

  async function handleSaveReflection(e: FormEvent, step: JourneyStep) {
    e.preventDefault();
    if (await apply((j) => saveReflection(j, step.id, reflection))) setReflecting(null);
  }

  async function handleSaveEdit(e: FormEvent, step: JourneyStep) {
    e.preventDefault();
    if (!editText.trim()) return;
    if (await apply((j) => editStep(j, step.id, editText))) setEditingStep(null);
  }

  async function handleConfirm() {
    if (!confirm) return;
    setBusy(true);
    if (confirm.kind === 'journey') {
      try {
        await deleteJourney(id);
        navigate('/growth', { replace: true });
        return;
      } catch {
        setFailed("Couldn't delete this journey. Please try again.");
      }
    } else if (confirm.kind === 'swap') {
      if (await apply((j) => deleteJourneySwap(j, confirm.swap.id))) setEditingSwap(null);
    } else if (confirm.kind === 'step') {
      await apply((j) => deleteStep(j, confirm.step.id));
    } else {
      await apply((j) => unmarkTried(j, confirm.step.id));
    }
    setBusy(false);
    setConfirm(null);
  }

  function unmark(step: JourneyStep) {
    // Only ask first if there's a reflection that would be lost.
    if (step.reflection) setConfirm({ kind: 'unmark', step });
    else void apply((j) => unmarkTried(j, step.id));
    if (reflecting === step.id) setReflecting(null);
  }

  const back = { to: '/growth', label: 'Growth' };

  if (status !== 'ready' || !journey) {
    return (
      <PageShell title="Journey" subtitle="" back={back}>
        <div className={`card ${status === 'error' ? 'form-error' : 'placeholder'}`} role={status === 'error' ? 'alert' : undefined}>
          {status === 'loading'
            ? 'Loading…'
            : status === 'missing'
              ? "This journey isn't on this device anymore."
              : "Couldn't read this journey on this device."}
        </div>
      </PageShell>
    );
  }

  const last = journey.steps.length - 1;

  return (
    <PageShell title={journey.title} subtitle={journey.steps.length ? journeySummary(journey) : 'One thing you’re working on.'} back={back}>

      {renaming ? (
        <form className="card positive-form list-rename" onSubmit={handleRename} noValidate>
          <label htmlFor="journey-title">Journey name</label>
          <input
            id="journey-title"
            type="text"
            className="input"
            value={title}
            maxLength={JOURNEY_TITLE_MAX}
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError(null);
            }}
          />
          {titleError && (
            <p className="form-error" role="alert">
              {titleError}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              Save name
            </button>
            <button type="button" className="btn-secondary" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="list-actions">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => {
              setTitle(journey.title);
              setTitleError(null);
              setRenaming(true);
            }}
          >
            Rename
          </button>
          <button type="button" className="btn-danger-outline btn-small" onClick={() => setConfirm({ kind: 'journey' })}>
            Delete journey
          </button>
        </div>
      )}

      {failed && (
        <p className="form-error" role="alert">
          {failed}
        </p>
      )}

      {/* 🎯 The goal */}
      <section className="journey-part" aria-labelledby="goal-heading">
        <div className="goals-header">
          <h2 id="goal-heading" className="section-title">
            <span aria-hidden="true">🎯</span> The goal
          </h2>
          {journey.goal && !editingGoal && (
            <button type="button" className="btn-secondary btn-small" onClick={() => setEditingGoal(true)}>
              Edit
            </button>
          )}
        </div>
        {editingGoal ? (
          <GoalForm
            initial={journey.goal ?? undefined}
            onSave={async (draft) => {
              if (await apply((j) => saveJourneyGoal(j, draft))) setEditingGoal(false);
            }}
            onCancel={() => setEditingGoal(false)}
            extraActions={
              journey.goal ? (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={async () => {
                    if (await apply((j) => removeJourneyGoal(j))) setEditingGoal(false);
                  }}
                >
                  Remove goal
                </button>
              ) : undefined
            }
          />
        ) : journey.goal ? (
          <div className={`journey-goal${journey.goal.completedAt ? ' reached' : ''}`}>
            <p className="journey-goal-title">{journey.goal.title}</p>
            {journey.goal.note && (
              <p className="journey-goal-note">
                <span className="saved-label">Why it matters</span> {journey.goal.note}
              </p>
            )}
            {journey.goal.targetDate && !journey.goal.completedAt && (
              <p className="goal-meta">Target: {formatLongDay(journey.goal.targetDate)}</p>
            )}
            {journey.goal.completedAt ? (
              <div className="journey-goal-done">
                <span>Reached {triedDay(journey.goal.completedAt)} 🎉</span>
                <button type="button" className="btn-link ladder-unmark" onClick={() => apply((j) => setJourneyGoalReached(j, false))}>
                  Not yet
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary journey-reached" onClick={() => apply((j) => setJourneyGoalReached(j, true))}>
                I reached it 🎉
              </button>
            )}
          </div>
        ) : (
          <div className="card placeholder journey-empty">
            <p>Add the goal for this journey.</p>
            <button type="button" className="btn-secondary btn-small" onClick={() => setEditingGoal(true)}>
              + Add the goal
            </button>
          </div>
        )}
      </section>

      {/* 🪜 Small steps */}
      <section className="journey-part" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="section-title">
          <span aria-hidden="true">🪜</span> Small steps
        </h2>
        <p className="hint ladder-hint">A ladder toward the goal — start with the smallest step. Your pace is the right pace.</p>
        <form className="list-add" onSubmit={handleAddStep} noValidate>
          <label htmlFor="new-step" className="sr-only">
            Add a step
          </label>
          <input
            id="new-step"
            ref={addInput}
            type="text"
            className="input"
            value={newStep}
            maxLength={STEP_MAX}
            placeholder={journey.steps.length ? 'Add the next step' : 'e.g. Text one friend to say hi'}
            onChange={(e) => {
              setNewStep(e.target.value);
              if (stepError) setStepError(null);
            }}
          />
          <button type="submit" className="btn-primary list-add-btn">
            Add
          </button>
        </form>
        {stepError && (
          <p className="form-error" role="alert">
            {stepError}
          </p>
        )}

        {journey.steps.length === 0 ? (
          <EmptyState>No steps yet. What's the tiniest first step?</EmptyState>
        ) : (
          <ol className="ladder">
            {journey.steps.map((step, i) => (
              <li key={step.id} className={`ladder-step${step.triedAt ? ' tried' : ''}`}>
                <div className="ladder-top">
                  <span className="ladder-num" aria-hidden="true">
                    {step.triedAt ? '✓' : i + 1}
                  </span>
                  {editingStep === step.id ? (
                    <form className="ladder-edit" onSubmit={(e) => handleSaveEdit(e, step)}>
                      <label htmlFor={`edit-${step.id}`} className="sr-only">
                        Edit step {i + 1}
                      </label>
                      <input
                        id={`edit-${step.id}`}
                        type="text"
                        className="input"
                        value={editText}
                        maxLength={STEP_MAX}
                        autoFocus
                        onChange={(e) => setEditText(e.target.value)}
                      />
                      <div className="ladder-edit-actions">
                        <button type="submit" className="btn-primary btn-small" disabled={!editText.trim()}>
                          Save
                        </button>
                        <button type="button" className="btn-secondary btn-small" onClick={() => setEditingStep(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <span className="ladder-text">
                      <span className="sr-only">Step {i + 1}: </span>
                      {step.text}
                    </span>
                  )}
                </div>

                {step.triedAt && reflecting !== step.id && (
                  <div className="ladder-tried">
                    <span className="ladder-tried-date">Tried {triedDay(step.triedAt)}</span>
                    {step.reflection && <p className="ladder-reflection">{step.reflection}</p>}
                  </div>
                )}

                {reflecting === step.id && (
                  <form className="ladder-reflect" onSubmit={(e) => handleSaveReflection(e, step)}>
                    <label htmlFor={`reflect-${step.id}`}>How did it go?</label>
                    <textarea
                      id={`reflect-${step.id}`}
                      className="input"
                      rows={3}
                      value={reflection}
                      maxLength={REFLECTION_MAX}
                      placeholder="Anything you noticed, big or small (optional)"
                      autoFocus
                      onChange={(e) => setReflection(e.target.value)}
                    />
                    <div className="ladder-edit-actions">
                      <button type="submit" className="btn-primary btn-small">
                        Save note
                      </button>
                      <button type="button" className="btn-secondary btn-small" onClick={() => setReflecting(null)}>
                        Skip
                      </button>
                    </div>
                  </form>
                )}

                {editingStep !== step.id && reflecting !== step.id && (
                  <div className="ladder-actions">
                    {step.triedAt ? (
                      <>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            setReflection(step.reflection);
                            setReflecting(step.id);
                          }}
                        >
                          {step.reflection ? 'Edit note' : 'Add a note'}
                        </button>
                        <button type="button" className="btn-link ladder-unmark" onClick={() => unmark(step)}>
                          Un-mark
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn-secondary btn-small" onClick={() => handleTried(step)}>
                        Tried it
                      </button>
                    )}
                    <span className="ladder-tools">
                      <button
                        type="button"
                        className="ladder-icon"
                        aria-label={`Move step ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => apply((j) => moveStep(j, step.id, -1))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ladder-icon"
                        aria-label={`Move step ${i + 1} down`}
                        disabled={i === last}
                        onClick={() => apply((j) => moveStep(j, step.id, 1))}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="ladder-icon ladder-word"
                        aria-label={`Edit step ${i + 1}`}
                        onClick={() => {
                          setEditText(step.text);
                          setEditingStep(step.id);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ladder-icon ladder-word ladder-delete"
                        aria-label={`Delete step ${i + 1}`}
                        onClick={() => setConfirm({ kind: 'step', step })}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

      </section>

      {/* 🔄 Habits to change */}
      <section className="journey-part" aria-labelledby="swaps-heading">
        <div className="goals-header">
          <h2 id="swaps-heading" className="section-title">
            <span aria-hidden="true">🔄</span> Habits to change
          </h2>
          {editingSwap !== 'new' && (
            <button type="button" className="btn-secondary btn-small" onClick={() => setEditingSwap('new')}>
              + New swap
            </button>
          )}
        </div>
        <p className="hint habits-hint">A habit swap is a tiny plan for reshaping a habit that gets in this journey's way.</p>
        {editingSwap === 'new' && (
          <HabitForm
            examples={SWAP_EXAMPLES}
            onSave={async (draft) => {
              if (await apply((j) => saveJourneySwap(j, draft))) setEditingSwap(null);
            }}
            onCancel={() => setEditingSwap(null)}
          />
        )}
        {journey.swaps.length === 0 && editingSwap !== 'new' && <p className="hint journey-none">No habit swaps yet.</p>}
        {journey.swaps.length > 0 && (
          <ul className="habit-list">
            {journey.swaps.map((swap) =>
              editingSwap === swap.id ? (
                <li key={swap.id}>
                  <HabitForm
                    initial={swap}
                    examples={SWAP_EXAMPLES}
                    onSave={async (draft) => {
                      if (await apply((j) => saveJourneySwap(j, draft, swap))) setEditingSwap(null);
                    }}
                    onCancel={() => setEditingSwap(null)}
                    extraActions={
                      <button type="button" className="btn-danger-outline" onClick={() => setConfirm({ kind: 'swap', swap })}>
                        Delete
                      </button>
                    }
                  />
                </li>
              ) : (
                <li key={swap.id}>
                  <button
                    type="button"
                    className="habit-card swap-card"
                    aria-label={`Edit swap: when ${swap.trigger}, instead I'll try ${swap.newHabit}`}
                    onClick={() => setEditingSwap(swap.id)}
                  >
                    <SwapSentence trigger={swap.trigger} oldHabit={swap.oldHabit} newHabit={swap.newHabit} />
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'journey'
              ? 'Delete this journey?'
              : confirm.kind === 'swap'
                ? 'Delete this swap?'
                : confirm.kind === 'step'
                  ? 'Delete this step?'
                  : 'Un-mark this step?'
          }
          message={
            confirm.kind === 'journey'
              ? `"${journey.title}" — its goal, steps, notes and habit swaps — will be removed from this device. This can't be undone.`
              : confirm.kind === 'swap'
                ? `"When ${confirm.swap.trigger}" will be removed from this journey.`
                : confirm.kind === 'step'
                ? `"${confirm.step.text}" will be removed from this journey's steps. This can't be undone.`
                : `This clears the tried date and your note for "${confirm.step.text}".`
          }
          confirmLabel={
            confirm.kind === 'journey' ? 'Delete journey' : confirm.kind === 'swap' || confirm.kind === 'step' ? 'Delete' : 'Un-mark'
          }
          busy={busy}
          busyLabel={confirm.kind === 'unmark' ? 'Saving…' : 'Deleting…'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </PageShell>
  );
}
