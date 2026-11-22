import { useCallback, useEffect, useState, type FormEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import EmptyState from './EmptyState';
import { formatShortDay, todayKey } from '../lib/journal';
import {
  MEASURE_NAME_MAX,
  MEASURE_UNIT_MAX,
  addMeasurementKind,
  byDate,
  deleteMeasurementEntry,
  deleteMeasurementKind,
  fromBase,
  listMeasurementKinds,
  logMeasurement,
  measureType,
  otherUnit,
  type DisplayUnit,
  type MeasureType,
  type MeasurementEntry,
  type MeasurementKind,
} from '../lib/profile';

const UNITS_KEY = 'thrive.measureUnits';
type Units = { length: 'cm' | 'in'; weight: 'kg' | 'lb' };

function readUnits(): Units {
  try {
    const raw = JSON.parse(localStorage.getItem(UNITS_KEY) ?? '{}') as Partial<Units>;
    return { length: raw.length === 'in' ? 'in' : 'cm', weight: raw.weight === 'lb' ? 'lb' : 'kg' };
  } catch {
    return { length: 'cm', weight: 'kg' };
  }
}

const SUGGESTIONS: { name: string; type: MeasureType }[] = [
  { name: 'Weight', type: 'weight' },
  { name: 'Waist', type: 'length' },
  { name: 'Hips', type: 'length' },
  { name: 'Bust', type: 'length' },
  { name: 'Thigh', type: 'length' },
  { name: 'Upper arm', type: 'length' },
];

const TYPES: { type: MeasureType; label: string; hint: string }[] = [
  { type: 'length', label: 'Length', hint: 'cm / in' },
  { type: 'weight', label: 'Weight', hint: 'kg / lb' },
  { type: 'number', label: 'Just a number', hint: 'shown as-is' },
];

const dayLabel = (key: string) =>
  key.slice(0, 4) === todayKey().slice(0, 4) ? formatShortDay(key) : `${formatShortDay(key)}, ${key.slice(0, 4)}`;

/** Up to two decimals for a value as typed (70 stays "70", 27.55 stays "27.55"). */
const asTyped = (n: number) => String(Math.round(n * 100) / 100);
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** "70 cm · 27.6 in" (the unit it was typed in first), or "12 size" for just-a-number. */
function showValue(kind: MeasurementKind, e: MeasurementEntry) {
  const type = measureType(kind);
  if (type === 'number') return kind.unit ? `${asTyped(e.value)} ${kind.unit}` : asTyped(e.value);
  const entered: DisplayUnit = e.entered ?? (type === 'weight' ? 'kg' : 'cm');
  const other = otherUnit(entered);
  return `${asTyped(fromBase(e.value, entered))} ${entered} · ${oneDecimal(fromBase(e.value, other))} ${other}`;
}

/** Measurements: a calm record of things I choose to measure — values and dates, nothing more. */
export default function MeasurementsSection() {
  const [kinds, setKinds] = useState<MeasurementKind[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [units, setUnits] = useState<Units>(readUnits);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Adding a measurement
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<MeasureType>('length');
  const [label, setLabel] = useState('');
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

  function pickUnits(next: Units) {
    setUnits(next);
    try {
      localStorage.setItem(UNITS_KEY, JSON.stringify(next));
    } catch {
      /* the choice just won't be remembered */
    }
  }

  function startAdding() {
    setAdding(true);
    setOpenId(null);
    setName('');
    setType('length');
    setLabel('');
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
      const kind = await addMeasurementKind(clean, type, label);
      setAdding(false);
      await refresh();
      setMessage(`${kind.name} added.`);
      openKind(kind.id, false);
    } catch {
      setAddError("Couldn't save this on this device. Please try again.");
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

  const unitFor = (kind: MeasurementKind): DisplayUnit | null => {
    const t = measureType(kind);
    return t === 'length' ? units.length : t === 'weight' ? units.weight : null;
  };

  async function log(e: FormEvent, kind: MeasurementKind) {
    e.preventDefault();
    const n = Number(value.trim().replace(',', '.'));
    if (!value.trim() || !Number.isFinite(n)) return setError('Please enter a number, like 70 or 70.5.');
    const unit = unitFor(kind);
    if (unit && (n <= 0 || n >= 10000)) return setError('Please enter a number, like 70 or 70.5.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Please pick a date.');
    setBusy(true);
    try {
      await logMeasurement(kind, n, unit, date);
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

  const switcher = (title: string, options: readonly string[], current: string, onPick: (u: string) => void) => (
    <div className="measure-switch" role="group" aria-label={`Type ${title.toLowerCase()} in`}>
      <span className="measure-switch-label">{title}</span>
      {options.map((u) => (
        <button key={u} type="button" className={`measure-pill${u === current ? ' active' : ''}`} aria-pressed={u === current} onClick={() => onPick(u)}>
          {u}
        </button>
      ))}
    </div>
  );

  const hasLength = !!kinds?.some((k) => measureType(k) === 'length');
  const hasWeight = !!kinds?.some((k) => measureType(k) === 'weight');

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
          {SUGGESTIONS.map((s) => (
            <button key={s.name} type="button" className="measure-pill" onClick={() => (setName(s.name), setType(s.type), setAddError(null))}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <fieldset className="field">
        <legend>What kind of number is it?</legend>
        <div className="measure-types">
          {TYPES.map((t) => (
            <label key={t.type} className="measure-type">
              <input type="radio" name="measure-type" value={t.type} checked={type === t.type} onChange={() => setType(t.type)} />
              <span>
                <span className="measure-type-label">{t.label}</span>
                <span className="measure-type-hint">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {type === 'number' && (
        <div className="field">
          <label htmlFor="measure-label">
            Unit label <span className="optional">(optional)</span>
          </label>
          <input id="measure-label" className="input measure-label-input" value={label} maxLength={MEASURE_UNIT_MAX} placeholder="e.g. size, reps, %" onChange={(e) => setLabel(e.target.value)} />
        </div>
      )}
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

      {(hasLength || hasWeight) && (
        <div className="measure-switches">
          {hasLength && switcher('Length', ['cm', 'in'], units.length, (u) => pickUnits({ ...units, length: u as Units['length'] }))}
          {hasWeight && switcher('Weight', ['kg', 'lb'], units.weight, (u) => pickUnits({ ...units, weight: u as Units['weight'] }))}
        </div>
      )}

      {kinds && kinds.length > 0 && (
        <ul className="measure-list">
          {kinds.map((kind) => {
            const history = [...kind.entries].sort(byDate);
            const latest = history[history.length - 1];
            const first = history[0];
            const isOpen = openId === kind.id;
            const unit = unitFor(kind);
            const inputLabel = unit ? `${kind.name} (${unit})` : kind.unit ? `${kind.name} (${kind.unit})` : kind.name;
            return (
              <li key={kind.id} className="measure-item">
                <button type="button" className="measure-row" aria-expanded={isOpen} onClick={() => openKind(kind.id)}>
                  <span className="measure-name">{kind.name}</span>
                  {latest ? (
                    <span className="measure-latest">
                      <span className="measure-value">{showValue(kind, latest)}</span>
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
                        <label htmlFor={`${kind.id}-value`}>{inputLabel}</label>
                        <input
                          id={`${kind.id}-value`}
                          className="input"
                          inputMode="decimal"
                          value={value}
                          placeholder="e.g. 70"
                          autoFocus
                          onChange={(e) => (setValue(e.target.value), setError(null))}
                        />
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
                                <span className="measure-value">{showValue(kind, e)}</span>
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
          message={`${confirmEntry.kind.name}: ${showValue(confirmEntry.kind, confirmEntry.entry)} on ${dayLabel(confirmEntry.entry.date)}. This can't be undone.`}
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
