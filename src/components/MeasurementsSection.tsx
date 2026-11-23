import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SAVE_FAILED } from '../lib/messages';
import ConfirmDialog from './ConfirmDialog';
import EmptyState from './EmptyState';
import { formatShortDay, todayKey } from '../lib/journal';
import {
  MEASURE_NAME_MAX,
  addMeasurementKind,
  byDate,
  cmToIn,
  deleteMeasurementEntry,
  deleteMeasurementKind,
  listMeasurementKinds,
  logMeasurement,
  type MeasurementEntry,
  type MeasurementKind,
} from '../lib/profile';

/** Names offered when adding a measurement (they just fill in the name). */
const SUGGESTIONS = ['Waist', 'Hips', 'Bust', 'Thigh', 'Upper arm'];

const dayLabel = (key: string) =>
  key.slice(0, 4) === todayKey().slice(0, 4) ? formatShortDay(key) : `${formatShortDay(key)}, ${key.slice(0, 4)}`;

/** One decimal at most, without a trailing ".0" (70 stays "70", 68.58 shows "68.6"). */
const upToOne = (n: number) => String(Math.round(n * 10) / 10);
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** A value in cm → "70 cm · 27.6 in". */
const showCm = (cm: number) => `${upToOne(cm)} cm · ${oneDecimal(cmToIn(cm))} in`;
const showValue = (e: MeasurementEntry) => showCm(e.value);

/** "70" / "70,5" → a number in cm; null for blank, NaN for anything that isn't a sensible length. */
function readCm(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : NaN;
}

/** Measurements: a calm record of things I choose to measure — values and dates, nothing more. */
export default function MeasurementsSection() {
  const [kinds, setKinds] = useState<MeasurementKind[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Adding a measurement
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  // Logging a value
  const [openId, setOpenId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayKey());
  const [error, setError] = useState<string | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<{ kind: MeasurementKind; entry: MeasurementEntry } | null>(null);
  const [confirmKind, setConfirmKind] = useState<MeasurementKind | null>(null);

  const refresh = useCallback(async () => {
    try {
      setKinds(await listMeasurementKinds());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startAdding() {
    setAdding(true);
    setOpenId(null);
    setName('');
    setAddError(null);
    setMessage('');
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setAddError('What would you like to measure? Give it a name.');
    const same = kinds?.find((k) => k.name.toLowerCase() === clean.toLowerCase());
    if (same) return setAddError(`You already have ${same.name} — tap it in the list to add a value.`);
    setBusy(true);
    try {
      const kind = await addMeasurementKind(clean);
      setAdding(false);
      await refresh();
      setMessage(`${kind.name} added.`);
      openKind(kind.id, false);
    } catch {
      setAddError(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  function openKind(id: string, clearMessage = true) {
    setOpenId((cur) => (cur === id && clearMessage ? null : id));
    setValue('');
    setDate(todayKey());
    setError(null);
    if (clearMessage) setMessage('');
  }

  async function log(e: FormEvent, kind: MeasurementKind) {
    e.preventDefault();
    const n = readCm(value);
    if (n === null || Number.isNaN(n)) return setError('Please enter a number in cm, like 70 or 70.5.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Please pick a date.');
    setBusy(true);
    try {
      await logMeasurement(kind, n, date);
      setValue('');
      setDate(todayKey());
      setMessage(`${kind.name} saved.`);
      await refresh();
    } catch {
      setError("Couldn't save this on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry() {
    if (!confirmEntry) return;
    setBusy(true);
    try {
      await deleteMeasurementEntry(confirmEntry.kind, confirmEntry.entry.id);
      setMessage('Deleted.');
      await refresh();
    } finally {
      setBusy(false);
      setConfirmEntry(null);
    }
  }

  async function removeKind() {
    if (!confirmKind) return;
    setBusy(true);
    try {
      await deleteMeasurementKind(confirmKind.id);
      setOpenId(null);
      setMessage(`${confirmKind.name} deleted.`);
      await refresh();
    } finally {
      setBusy(false);
      setConfirmKind(null);
    }
  }

  const addForm = (
    <form className="card measure-add" onSubmit={(e) => void add(e)} noValidate>
      <div className="field">
        <label htmlFor="measure-name">What would you like to measure?</label>
        <input
          id="measure-name"
          className="input"
          value={name}
          maxLength={MEASURE_NAME_MAX}
          placeholder="e.g. Waist"
          autoFocus
          onChange={(e) => (setName(e.target.value), setAddError(null))}
        />
        <div className="measure-chips" aria-label="Suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" className="measure-pill" onClick={() => (setName(suggestion), setAddError(null))}>
              {suggestion}
            </button>
          ))}
        </div>
        <p className="hint">Measured in cm — the inches are shown for you.</p>
      </div>
      {addError && <p className="form-error" role="alert">{addError}</p>}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          Add
        </button>
        <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <section className="measurements" aria-labelledby="measurements-heading">
      <div className="goals-header">
        <h2 id="measurements-heading" className="section-title">
          Measurements
        </h2>
        {!adding && (
          <button type="button" className="btn-secondary btn-small" onClick={startAdding}>
            + Add a measurement
          </button>
        )}
      </div>
      <p className="save-status" role="status">
        {message}
      </p>

      {adding && addForm}
      {failed && <p className="form-error" role="alert">Couldn't read your measurements on this device.</p>}
      {kinds && kinds.length === 0 && !adding && (
        <EmptyState>No measurements yet. Add your first whenever it feels useful — no pressure either way.</EmptyState>
      )}

      {kinds && kinds.length > 0 && (
        <ul className="measure-list">
          {kinds.map((kind) => {
            const history = [...kind.entries].sort(byDate);
            const latest = history[history.length - 1];
            const first = history[0];
            const isOpen = openId === kind.id;
            const typed = isOpen ? readCm(value) : null;
            return (
              <li key={kind.id} className="measure-item">
                <button type="button" className="measure-row" aria-expanded={isOpen} onClick={() => openKind(kind.id)}>
                  <span className="measure-name">{kind.name}</span>
                  {latest ? (
                    <span className="measure-latest">
                      <span className="measure-value">{showValue(latest)}</span>
                      <span className="measure-date">{dayLabel(latest.date)}</span>
                    </span>
                  ) : (
                    <span className="measure-none">Not logged yet</span>
                  )}
                </button>

                {isOpen && (
                  <div className="measure-panel">
                    <form className="measure-form" onSubmit={(e) => void log(e, kind)} noValidate>
                      <div className="field">
                        <label htmlFor={`${kind.id}-value`}>{kind.name}</label>
                        <div className="about-number-row">
                          <span className="about-number">
                            <input
                              id={`${kind.id}-value`}
                              className="input"
                              inputMode="decimal"
                              value={value}
                              placeholder="e.g. 70"
                              autoFocus
                              aria-describedby={`${kind.id}-in`}
                              onChange={(e) => (setValue(e.target.value), setError(null))}
                            />
                            <span className="about-unit" aria-hidden="true">cm</span>
                          </span>
                          <span id={`${kind.id}-in`} className="about-convert" aria-live="polite">
                            {typed !== null && !Number.isNaN(typed) ? `${oneDecimal(cmToIn(typed))} in` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor={`${kind.id}-date`}>Date</label>
                        <input id={`${kind.id}-date`} className="input" type="date" value={date} max={todayKey()} onChange={(e) => (setDate(e.target.value), setError(null))} />
                      </div>
                      {error && <p className="form-error" role="alert">{error}</p>}
                      <div className="form-actions">
                        <button type="submit" className="btn-primary" disabled={busy}>
                          Save
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => openKind(kind.id)}>
                          Close
                        </button>
                      </div>
                    </form>

                    {history.length > 0 && (
                      <div className="measure-history">
                        <h3 className="saved-label">History</h3>
                        <ul>
                          {[...history].reverse().map((e) => (
                            <li key={e.id}>
                              <span className="measure-history-main">
                                <span className="measure-value">{showValue(e)}</span>
                                <span className="measure-date">
                                  {dayLabel(e.date)}
                                  {e.id === first.id && <span className="measure-start"> · Starting point</span>}
                                </span>
                              </span>
                              <button type="button" className="measure-delete" onClick={() => setConfirmEntry({ kind, entry: e })} aria-label={`Delete ${kind.name} from ${dayLabel(e.date)}`}>
                                Delete
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="measure-kind-actions">
                      <button type="button" className="btn-danger-outline" onClick={() => setConfirmKind(kind)}>
                        Delete {kind.name}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirmEntry && (
        <ConfirmDialog
          title="Delete this value?"
          message={`${confirmEntry.kind.name}: ${showValue(confirmEntry.entry)} on ${dayLabel(confirmEntry.entry.date)}. This can't be undone.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void removeEntry()}
          onCancel={() => setConfirmEntry(null)}
        />
      )}
      {confirmKind && (
        <ConfirmDialog
          title={`Delete ${confirmKind.name}?`}
          message={
            confirmKind.entries.length
              ? `This removes ${confirmKind.name} and all ${confirmKind.entries.length} ${confirmKind.entries.length === 1 ? 'value' : 'values'} logged for it. This can't be undone.`
              : `This removes ${confirmKind.name} from your measurements. This can't be undone.`
          }
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void removeKind()}
          onCancel={() => setConfirmKind(null)}
        />
      )}
    </section>
  );
}
