import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loadSettings } from '../lib/settings';
import { SAVE_FAILED } from '../lib/messages';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { HealthCalendar } from '../components/HealthSection';
import { formatLongDay, todayKey } from '../lib/journal';
import {
  EXERCISE_CHIPS,
  EXERCISE_MAX,
  FOOD_CALORIES_MAX,
  FOOD_NAME_MAX,
  NUTRIENT_MAX,
  foodTotals,
  newFoodLog,
  type FoodLog,
  MED_NAME_MAX,
  MED_TIMING_MAX,
  addMedication,
  deleteMedication,
  emptyDraft,
  getHealthDay,
  isEmptyDay,
  listMedications,
  saveHealthDay,
  type HealthDay,
  type HealthDraft,
  type Medication,
} from '../lib/health';

const BACK = { to: '/journal?section=health', label: 'Journal' };
/** Day pages and Medications/Vitamins go back to the Health Journey page (Today + calendar). */
const BACK_HEALTH = { to: '/journal/health', label: 'Health Journey' };
const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));

/** "1800" → 1800; "" → null; anything else → NaN (a gentle message). */
function readWhole(text: string, max: number): number | null {
  const t = text.trim().replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : NaN;
}

/* ================================ Calories and calorie logs ================================ */

/** "12", "12.5", "12,5" → grams (one decimal); "" → null; anything else → NaN. */
function readGrams(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= NUTRIENT_MAX ? Math.round(n * 10) / 10 : NaN;
}
const g = (n: number) => `${String(n)} g`;

/** "Sugar 12 g · Added sugar 4 g · Protein 20 g" (only the ones that are filled in). */
function nutrientLine(n: { sugar: number | null; addedSugar: number | null; protein: number | null }) {
  return [n.sugar !== null && `Sugar ${g(n.sugar)}`, n.addedSugar !== null && `Added sugar ${g(n.addedSugar)}`, n.protein !== null && `Protein ${g(n.protein)}`]
    .filter(Boolean)
    .join(' · ');
}

type CalorieFieldProps = {
  foods: FoodLog[];
  typed: string;
  onTyped: (text: string) => void;
  onFoods: (foods: FoodLog[]) => void;
};

/**
 * Calories: either one number typed for the day, or individual logs whose total is worked out automatically.
 * Only the newest log shows; "See all" opens the rest.
 */
function CalorieField({ foods, typed, onTyped, onFoods }: CalorieFieldProps) {
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [sugar, setSugar] = useState('');
  const [added, setAdded] = useState('');
  const [protein, setProtein] = useState('');
  const [error, setError] = useState<string | null>(null);
  const totals = foodTotals(foods);
  const newestFirst = [...foods].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, 1);

  function reset() {
    setName('');
    setKcal('');
    setSugar('');
    setAdded('');
    setProtein('');
    setError(null);
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const c = readWhole(kcal, FOOD_CALORIES_MAX);
    if (c === null || Number.isNaN(c)) return setError('Add the calories, like 320.');
    const [s, a, p] = [readGrams(sugar), readGrams(added), readGrams(protein)];
    if ([s, a, p].some((v) => Number.isNaN(v))) return setError('Sugar, added sugar and protein are in grams, like 12 or 12.5 (or leave them blank).');
    onFoods([...foods, newFoodLog({ name, calories: c, sugar: s, addedSugar: a, protein: p })]);
    reset();
    setAdding(false);
  }

  const gramsInput = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="field food-gram">
      <label htmlFor={id}>{label}</label>
      <span className="about-number food-number">
        <input id={id} className="input" inputMode="decimal" value={value} placeholder="—" onChange={(e) => (set(e.target.value), setError(null))} />
        <span className="about-unit" aria-hidden="true">g</span>
      </span>
    </div>
  );

  return (
    <div className="field calorie-field">
      <span className="calorie-label" id="calories-label">
        Calories <span className="optional">(optional)</span>
      </span>

      {foods.length > 0 ? (
        <div className="calorie-total" aria-live="polite">
          <span className="calorie-total-number">{totals.calories.toLocaleString()} kcal</span>
          <span className="hint">
            Worked out from {foods.length} {foods.length === 1 ? 'log' : 'logs'}
            {nutrientLine(totals) ? ` · ${nutrientLine(totals)}` : ''}
          </span>
        </div>
      ) : (
        <div className="about-number-row">
          <span className="about-number health-number">
            <input
              id="health-calories"
              className="input"
              inputMode="numeric"
              aria-labelledby="calories-label"
              value={typed}
              placeholder="e.g. 1800"
              onChange={(e) => onTyped(e.target.value)}
            />
            <span className="about-unit" aria-hidden="true">kcal</span>
          </span>
          <span className="hint">or add logs below</span>
        </div>
      )}

      {foods.length > 0 && (
        <ul className="food-list" aria-label={showAll ? 'All calorie logs, newest first' : 'Latest calorie log'}>
          {shown.map((f) => (
            <li key={f.id} className="food-item">
              <span className="food-main">
                <span className="food-name">{f.name || 'Something to eat'}</span>
                {nutrientLine(f) && <span className="hint">{nutrientLine(f)}</span>}
              </span>
              <span className="food-kcal">{f.calories === null ? '— kcal' : `${f.calories.toLocaleString()} kcal`}</span>
              <button type="button" className="positive-delete" aria-label={`Delete ${f.name || 'this log'}`} onClick={() => onFoods(foods.filter((x) => x.id !== f.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="food-form" onSubmit={add} noValidate>
          <div className="field">
            <label htmlFor="food-name">
              What <span className="optional">(optional)</span>
            </label>
            <input id="food-name" className="input" value={name} maxLength={FOOD_NAME_MAX} placeholder="e.g. Oatmeal with banana" autoFocus onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="food-kcal">Calories</label>
            <span className="about-number health-number">
              <input id="food-kcal" className="input" inputMode="numeric" value={kcal} placeholder="e.g. 320" onChange={(e) => (setKcal(e.target.value), setError(null))} />
              <span className="about-unit" aria-hidden="true">kcal</span>
            </span>
          </div>
          <div className="food-grams">
            {gramsInput('food-sugar', 'Sugar', sugar, setSugar)}
            {gramsInput('food-added', 'Added sugar', added, setAdded)}
            {gramsInput('food-protein', 'Protein', protein, setProtein)}
          </div>
          <p className="hint">Sugar, added sugar and protein are optional.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              Add log
            </button>
            <button type="button" className="btn-secondary" onClick={() => (reset(), setAdding(false))}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="food-links">
          <button type="button" className="saving-toggle" onClick={() => setAdding(true)}>
            + Add a calorie log
          </button>
          {foods.length > 1 && (
            <button type="button" className="saving-toggle food-toggle" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show only the latest' : `See all ${foods.length} logs`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================ One day ================================ */

export function HealthDayPage() {
  const { date: param } = useParams();
  const navigate = useNavigate();
  const date = isDay(param) && param <= todayKey() ? param : todayKey();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [existing, setExisting] = useState<HealthDay | undefined>();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [draft, setDraft] = useState<HealthDraft>(emptyDraft);
  const [calories, setCalories] = useState('');
  const [steps, setSteps] = useState('');
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const loaded = useRef(false);
  const exerciseInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    loaded.current = false;
    setStatus('loading');
    Promise.all([getHealthDay(date), listMedications()])
      .then(([day, list]) => {
        if (!active) return;
        setExisting(day);
        setMeds(list);
        const d: HealthDraft = day
          ? { calories: day.calories, foods: day.foods ?? [], exercise: day.exercise, steps: day.steps, water: day.water, meds: day.meds }
          : emptyDraft();
        setDraft(d);
        setCalories(d.calories === null || d.foods.length ? '' : String(d.calories));
        setSteps(d.steps === null ? '' : String(d.steps));
        setSaveState('');
        setStatus('ready');
        loaded.current = true;
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [date]);

  // Every change saves on its own (a moment after the last tap or keystroke), on this day's date.
  useEffect(() => {
    if (!loaded.current) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      saveHealthDay(date, draft, existing)
        .then((saved) => {
          setExisting(saved ?? undefined);
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const change = (patch: Partial<HealthDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function numberField(text: string, set: (t: string) => void, key: 'calories' | 'steps', max: number, label: string) {
    set(text);
    const n = readWhole(text, max);
    if (Number.isNaN(n)) return setFieldError(`${label} should be a whole number, like ${key === 'calories' ? '1800' : '6000'} (or leave it blank).`);
    setFieldError(null);
    change({ [key]: n } as Partial<HealthDraft>);
  }

  function tapGlass(n: number) {
    // Tap a glass to fill up to it; tap the last filled glass again to empty it.
    change({ water: draft.water === n ? n - 1 : n });
  }

  function toggleMed(m: Medication) {
    const taken = draft.meds.some((x) => x.id === m.id);
    change({ meds: taken ? draft.meds.filter((x) => x.id !== m.id) : [...draft.meds, { id: m.id, name: m.name }] });
  }

  // Medications checked off this day that are no longer on my list still show (so a past day reads right).
  const formerMeds = draft.meds.filter((x) => !meds.some((m) => m.id === x.id));
  const chip = EXERCISE_CHIPS.find((c) => c.toLowerCase() === draft.exercise.trim().toLowerCase());
  const waterTarget = loadSettings().waterTarget;

  return (
    <PageShell title="Health Journey" subtitle={formatLongDay(date)} back={BACK_HEALTH}>
      {status === 'loading' && <div className="card placeholder">Loading…</div>}
      {status === 'error' && (
        <div className="card form-error" role="alert">
          Couldn't read this day on this device.
        </div>
      )}
      {status === 'ready' && (
        <>
          <p className="save-status" role="status">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved on this device.' : saveState === 'error' ? '' : ''}
          </p>
          {saveState === 'error' && (
            <p className="form-error" role="alert">
              Couldn't save this day. Please try again.
            </p>
          )}
          {isEmptyDay(draft) && <EmptyState>Nothing logged for this day yet.</EmptyState>}

          <div className="card health-form">
            <CalorieField
              foods={draft.foods}
              typed={calories}
              onTyped={(text) => numberField(text, setCalories, 'calories', 100_000, 'Calories')}
              onFoods={(foods) => {
                const typedNumber = readWhole(calories, 100_000);
                change({ foods, ...(foods.length ? {} : { calories: typedNumber === null || Number.isNaN(typedNumber) ? null : typedNumber }) });
              }}
            />

            <div className="field">
              <label htmlFor="health-exercise">
                Exercise <span className="optional">(optional)</span>
              </label>
              <div className="measure-chips" role="group" aria-label="Quick picks">
                {EXERCISE_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`measure-pill${chip === c ? ' active' : ''}`}
                    aria-pressed={chip === c}
                    onClick={() => change({ exercise: chip === c ? '' : c })}
                  >
                    {c}
                  </button>
                ))}
                <button
                  type="button"
                  className={`measure-pill${draft.exercise && !chip ? ' active' : ''}`}
                  onClick={() => {
                    if (chip) change({ exercise: '' });
                    exerciseInput.current?.focus();
                  }}
                >
                  Custom
                </button>
              </div>
              <input
                id="health-exercise"
                ref={exerciseInput}
                className="input"
                value={draft.exercise}
                maxLength={EXERCISE_MAX}
                placeholder="e.g. A long walk with Mia"
                onChange={(e) => change({ exercise: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="health-steps">
                Steps <span className="optional">(optional)</span>
              </label>
              <span className="about-number health-number">
                <input
                  id="health-steps"
                  className="input"
                  inputMode="numeric"
                  value={steps}
                  placeholder="e.g. 6000"
                  onChange={(e) => numberField(e.target.value, setSteps, 'steps', 1_000_000, 'Steps')}
                />
                <span className="about-unit" aria-hidden="true">steps</span>
              </span>
            </div>
            {fieldError && (
              <p className="form-error" role="alert">
                {fieldError}
              </p>
            )}

            <fieldset className="field">
              <legend>
                Water <span className="optional">({draft.water} of {waterTarget} glasses)</span>
              </legend>
              <div className="water-row">
                {Array.from({ length: Math.max(waterTarget, draft.water) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`glass${n <= draft.water ? ' full' : ''}`}
                    aria-label={`${n} ${n === 1 ? 'glass' : 'glasses'}`}
                    aria-pressed={n <= draft.water}
                    onClick={() => tapGlass(n)}
                  >
                    <svg viewBox="0 0 24 28" aria-hidden="true">
                      <path className="glass-water" d="M5.6 12h12.8l-1.3 12.2a2 2 0 0 1-2 1.8H8.9a2 2 0 0 1-2-1.8z" />
                      <path className="glass-outline" d="M3.5 3h17l-2.3 21.2a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8z" />
                    </svg>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend>
                Medications/Vitamins <span className="optional">(optional)</span>
              </legend>
              {meds.length === 0 && formerMeds.length === 0 ? (
                <p className="hint">
                  Nothing on your medications/vitamins list. <Link to="/journal/health/medications">Add one</Link> if you'd like to check them off here.
                </p>
              ) : (
                <ul className="list-items health-meds">
                  {[...meds.map((m) => ({ id: m.id, name: m.name, timing: m.timing, onList: true })), ...formerMeds.map((m) => ({ ...m, timing: '', onList: false }))].map((m) => {
                    const taken = draft.meds.some((x) => x.id === m.id);
                    return (
                      <li key={m.id} className={`list-item${taken ? ' taken' : ''}`}>
                        <label className="list-item-main">
                          <input
                            type="checkbox"
                            checked={taken}
                            onChange={() => (m.onList ? toggleMed(meds.find((x) => x.id === m.id)!) : change({ meds: draft.meds.filter((x) => x.id !== m.id) }))}
                          />
                          <span className="list-check" aria-hidden="true">
                            {taken ? '✓' : ''}
                          </span>
                          <span className="health-med-text">
                            <span className="list-item-text">{m.name}</span>
                            {m.timing && <span className="list-link-meta">{m.timing}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          </div>

          <div className="health-day-links">
            {date !== todayKey() && (
              <button type="button" className="see-more health-today-link" onClick={() => navigate(`/journal/health/day/${todayKey()}`)}>
                Go to today
              </button>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}

/* ================================ All days ================================ */

/** Today and the calendar (the same as on the Journal tab), on a page of its own. */
export function HealthDaysPage() {
  return (
    <PageShell title="Health Journey" subtitle="A small daily log, all by hand." back={BACK}>
      <div className="health-days-page">
        <HealthCalendar />
        <Link to="/journal/health/medications" className="list-link health-meds-link">
          <span className="list-link-main">
            <span className="list-link-title">Medications/Vitamins</span>
            <span className="list-link-meta">Your own list, to check off each day</span>
          </span>
          <span className="quick-action-arrow" aria-hidden="true">›</span>
        </Link>
      </div>
    </PageShell>
  );
}

/* ================================ My medications/vitamins ================================ */

export function MedicationsPage() {
  const [meds, setMeds] = useState<Medication[] | null>(null);
  const [name, setName] = useState('');
  const [timing, setTiming] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<Medication | null>(null);

  const refresh = () =>
    listMedications()
      .then(setMeds)
      .catch(() => setMeds([]));
  useEffect(() => {
    void refresh();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give it a name.'); 
    try {
      const med = await addMedication(name, timing);
      setName('');
      setTiming('');
      setError(null);
      setMessage(`${med.name} added.`);
      await refresh();
    } catch {
      setError(SAVE_FAILED);
    }
  }

  async function remove() {
    if (!confirm) return;
    const med = confirm;
    setConfirm(null);
    await deleteMedication(med.id);
    setMessage(`${med.name} removed from your list.`);
    await refresh();
  }

  return (
    <PageShell title="Medications/Vitamins" subtitle="Your own list, to check off in Health Journey." back={BACK_HEALTH}>
      <div className="health-meds-page">
      <form className="card positive-form" onSubmit={(e) => void add(e)} noValidate>
        <div className="field">
          <label htmlFor="med-name">Medication or vitamin</label>
          <input id="med-name" className="input" value={name} maxLength={MED_NAME_MAX} placeholder="e.g. Vitamin D" onChange={(e) => (setName(e.target.value), setError(null))} />
        </div>
        <div className="field">
          <label htmlFor="med-timing">
            When <span className="optional">(optional)</span>
          </label>
          <input id="med-timing" className="input" value={timing} maxLength={MED_TIMING_MAX} placeholder="e.g. after dinner" onChange={(e) => setTiming(e.target.value)} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn-primary">
            Add to my list
          </button>
        </div>
      </form>
      <p className="save-status health-med-status" role="status">
        {message}
      </p>

      {meds && meds.length === 0 && <EmptyState>No medications or vitamins on your list yet.</EmptyState>}
      {meds && meds.length > 0 && <h2 className="saved-label health-meds-label">Your list</h2>}
      {meds && meds.length > 0 && (
        <ul className="list-items">
          {meds.map((m) => (
            <li key={m.id} className="list-item">
              <span className="list-item-main health-med-row">
                <span className="health-med-text">
                  <span className="list-item-text">{m.name}</span>
                  {m.timing && <span className="list-link-meta">{m.timing}</span>}
                </span>
              </span>
              <button type="button" className="list-item-delete" aria-label={`Remove ${m.name}`} onClick={() => setConfirm(m)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      </div>

      {confirm && (
        <ConfirmDialog
          title={`Remove ${confirm.name}?`}
          message={`${confirm.name} will be taken off your list. Days you already checked it off keep it.`}
          confirmLabel="Remove"
          onConfirm={() => void remove()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </PageShell>
  );
}
