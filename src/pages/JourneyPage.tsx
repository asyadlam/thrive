import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatLongDay, todayKey } from '../lib/journal';
import {
  JOURNEY_TITLE_MAX,
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
  | { kind: 'step'; step: JourneyStep }
  | { kind: 'unmark'; step: JourneyStep }
  | null;

const triedDay = (iso: string) => formatLongDay(todayKey(new Date(iso)));

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
    <PageShell title={journey.title} subtitle={journeySummary(journey)} back={back}>
      <p className="journey-pace">Your pace is the right pace. Skipping or pausing is always allowed.</p>

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

      <h2 className="section-title">Your ladder</h2>
      <p className="hint ladder-hint">Start with the smallest step. Add more one at a time.</p>
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
          placeholder={journey.steps.length ? 'Add the next step' : 'e.g. Look at a café menu online'}
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
      {failed && (
        <p className="form-error" role="alert">
          {failed}
        </p>
      )}

      {journey.steps.length === 0 ? (
        <EmptyState>No steps yet. What's one small thing that would feel a little brave?</EmptyState>
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

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'journey' ? 'Delete this journey?' : confirm.kind === 'step' ? 'Delete this step?' : 'Un-mark this step?'
          }
          message={
            confirm.kind === 'journey'
              ? `"${journey.title}" and all its steps and notes will be removed from this device. This can't be undone.`
              : confirm.kind === 'step'
                ? `"${confirm.step.text}" will be removed from your ladder. This can't be undone.`
                : `This clears the tried date and your note for "${confirm.step.text}".`
          }
          confirmLabel={confirm.kind === 'journey' ? 'Delete journey' : confirm.kind === 'step' ? 'Delete step' : 'Un-mark'}
          busy={busy}
          busyLabel={confirm.kind === 'unmark' ? 'Saving…' : 'Deleting…'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </PageShell>
  );
}
