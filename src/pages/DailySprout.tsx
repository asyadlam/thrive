import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import QuickEntryPanel from '../components/QuickEntryPanel';
import { isValidDayKey } from '../lib/calendar';
import { todayKey } from '../lib/journal';
import { loadSettings } from '../lib/settings';
import { useDataVersion } from '../lib/dataEvents';
import { setAssistantDay } from '../lib/assistantContext';
import {
  EXERCISE_CHIPS,
  EXERCISE_MAX,
  FOOD_NAME_MAX,
  INTENTION_MAX,
  MED_NAME_MAX,
  MED_TIMING_MAX,
  TODO_MAX,
  addMedication,
  draftOf,
  foodTotals,
  getHealthDay,
  listMedications,
  type FoodLog,
  type HealthDraft,
  type Medication,
} from '../lib/health';
import {
  addFood,
  addTodo,
  dayName,
  deleteFood,
  deleteTodo,
  moveOldTodoList,
  setExercise,
  setIntention,
  setMedTaken,
  setSteps,
  setStretch,
  setTodoDone,
  setWater,
  shiftDay,
} from '../lib/sprout';

type Day = Required<HealthDraft>;

/** "320" → 320, "" → null, anything else → NaN. Decimals allowed for grams. */
function readNumber(text: string, max: number, decimals = false): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  if (!(decimals ? /^\d+(\.\d+)?$/ : /^\d+$/).test(t)) return NaN;
  const n = Number(t);
  return n <= max ? n : NaN;
}

const g = (v: number | null) => (v === null ? '—' : `${v.toLocaleString()} g`);

/** The day's calories as a ring against the target, with protein and added sugar under it. */
function CalorieRing({ foods }: { foods: FoodLog[] }) {
  const { calorieTarget, proteinTarget, addedSugarTarget } = loadSettings();
  const totals = foodTotals(foods);
  const r = 52;
  const c = 2 * Math.PI * r;
  const part = Math.min(1, totals.calories / calorieTarget);
  return (
    <div className="sprout-ring-wrap">
      <svg className="sprout-ring" viewBox="0 0 128 128" role="img" aria-label={`${totals.calories.toLocaleString()} of ${calorieTarget.toLocaleString()} calories`}>
        <circle className="sprout-ring-track" cx="64" cy="64" r={r} />
        <circle className="sprout-ring-fill" cx="64" cy="64" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - part)} transform="rotate(-90 64 64)" />
        <text x="64" y="62" textAnchor="middle" className="sprout-ring-number">
          {totals.calories.toLocaleString()}
        </text>
        <text x="64" y="82" textAnchor="middle" className="sprout-ring-of">
          of {calorieTarget.toLocaleString()} kcal
        </text>
      </svg>
      <p className="sprout-ring-totals">
        <span>
          Protein <strong>{(totals.protein ?? 0).toLocaleString()} g</strong> of {proteinTarget} g
        </span>
        <span>
          Added sugar <strong>{(totals.addedSugar ?? 0).toLocaleString()} g</strong> of {addedSugarTarget} g
        </span>
      </p>
      <p className="hint sprout-targets-note">These targets are yours, you can change them anytime in Settings.</p>
    </div>
  );
}

/** "Little sprout for the day:" — one intention per day, finishing "Today I'll try…". Saves when I leave the box. */
function IntentionLine({ date, intention }: { date: string; intention: string }) {
  const [text, setText] = useState(intention);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(intention); // follow the saved one, unless I'm typing
  }, [intention]);
  function save() {
    focused.current = false;
    const next = text.trim().slice(0, INTENTION_MAX);
    if (next !== intention.trim()) void setIntention(date, next);
  }
  return (
    <div className="sprout-intention">
      <label htmlFor="sprout-intention">Little sprout for the day:</label>
      <input
        id="sprout-intention"
        className="input"
        value={text}
        maxLength={INTENTION_MAX}
        placeholder="Today I'll try..."
        onFocus={() => (focused.current = true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
    </div>
  );
}

function FoodCard({ date, foods }: { date: string; foods: FoodLog[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [sugar, setSugar] = useState('');
  const [added, setAdded] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setKcal('');
    setProtein('');
    setSugar('');
    setAdded('');
    setError(null);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const calories = readNumber(kcal, 20_000);
    const nums = [readNumber(protein, 2000, true), readNumber(sugar, 2000, true), readNumber(added, 2000, true)];
    if (Number.isNaN(calories) || nums.some((n) => Number.isNaN(n))) return setError('Use plain numbers, like 320 or 12.5 (or leave a box empty).');
    if (!name.trim() && calories === null) return setError('Add a name or the calories.');
    const [p, s, a] = nums;
    if (s !== null && a !== null && a > s) return setError('Added sugar can’t be more than total sugar.');
    await addFood(date, { name, calories, protein: p, sugar: s, addedSugar: a });
    reset();
  }

  return (
    <section className="card sprout-card" aria-labelledby="sprout-food-heading">
      <h2 id="sprout-food-heading" className="sprout-card-title">
        Food
      </h2>
      <CalorieRing foods={foods} />
      {foods.length > 0 && (
        <ul className="sprout-foods">
          {foods.map((f) => (
            <li key={f.id} className="sprout-food">
              <span className="sprout-food-main">
                <span className="sprout-food-name">{f.name || 'Something to eat'}</span>
                <span className="sprout-food-nutrients">
                  Protein {g(f.protein)} · Sugar {g(f.sugar)} · Added sugar {g(f.addedSugar)}
                </span>
              </span>
              <span className="food-kcal">{f.calories === null ? '— kcal' : `${f.calories.toLocaleString()} kcal`}</span>
              <button type="button" className="positive-delete" aria-label={`Delete ${f.name || 'this food'}`} onClick={() => void deleteFood(date, f.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="food-form" onSubmit={(e) => void add(e)} noValidate>
          <div className="field">
            <label htmlFor="sprout-food-name">Food</label>
            <input id="sprout-food-name" className="input" value={name} maxLength={FOOD_NAME_MAX} placeholder="e.g. Oatmeal with banana" autoFocus onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="sprout-food-grid">
            <label className="field">
              <span>Calories</span>
              <span className="about-number">
                <input className="input" inputMode="numeric" value={kcal} placeholder="—" onChange={(e) => (setKcal(e.target.value), setError(null))} />
                <span className="about-unit" aria-hidden="true">kcal</span>
              </span>
            </label>
            <label className="field">
              <span>Protein</span>
              <span className="about-number">
                <input className="input" inputMode="decimal" value={protein} placeholder="—" onChange={(e) => (setProtein(e.target.value), setError(null))} />
                <span className="about-unit" aria-hidden="true">g</span>
              </span>
            </label>
            <label className="field">
              <span>Total sugar</span>
              <span className="about-number">
                <input className="input" inputMode="decimal" value={sugar} placeholder="—" onChange={(e) => (setSugar(e.target.value), setError(null))} />
                <span className="about-unit" aria-hidden="true">g</span>
              </span>
            </label>
            <label className="field">
              <span>Added sugar</span>
              <span className="about-number">
                <input className="input" inputMode="decimal" value={added} placeholder="—" onChange={(e) => (setAdded(e.target.value), setError(null))} />
                <span className="about-unit" aria-hidden="true">g</span>
              </span>
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              Add food
            </button>
            <button type="button" className="btn-secondary" onClick={() => (reset(), setAdding(false))}>
              Done
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="saving-toggle sprout-add" onClick={() => setAdding(true)}>
          + Add food
        </button>
      )}
    </section>
  );
}

function MovementCard({ date, day }: { date: string; day: Day }) {
  const [steps, setStepsText] = useState(day.steps === null ? '' : String(day.steps));
  // The text bar under the chips always shows the day's exercise (a chip's name, or my own words), like the
  // Health Journey page.
  const [exercise, setExerciseText] = useState(day.exercise);
  const [error, setError] = useState<string | null>(null);
  const stepsFocused = useRef(false);
  const exerciseFocused = useRef(false);
  const exerciseInput = useRef<HTMLInputElement>(null);
  const chip = EXERCISE_CHIPS.find((c) => c.toLowerCase() === day.exercise.trim().toLowerCase());
  const isCustom = !!day.exercise.trim() && !chip;

  // Follow the saved value (e.g. after the assistant logs steps), unless I'm typing in the box.
  useEffect(() => {
    if (!stepsFocused.current) setStepsText(day.steps === null ? '' : String(day.steps));
  }, [day.steps]);
  useEffect(() => {
    if (!exerciseFocused.current) setExerciseText(day.exercise);
  }, [day.exercise]);

  function saveSteps() {
    stepsFocused.current = false;
    const n = readNumber(steps.replace(/[,\s]/g, ''), 1_000_000);
    if (Number.isNaN(n)) return setError('Steps should be a whole number, like 6000.');
    setError(null);
    if (n !== day.steps) void setSteps(date, n);
  }

  function saveExercise() {
    exerciseFocused.current = false;
    const text = exercise.trim().slice(0, EXERCISE_MAX);
    if (text !== day.exercise) void setExercise(date, text);
  }

  return (
    <section className="card sprout-card" aria-labelledby="sprout-move-heading">
      <h2 id="sprout-move-heading" className="sprout-card-title">
        Movement
      </h2>
      <div className="field">
        <label htmlFor="sprout-steps">Steps</label>
        <span className="about-number health-number">
          <input
            id="sprout-steps"
            className="input"
            inputMode="numeric"
            value={steps}
            placeholder="e.g. 6000"
            onFocus={() => (stepsFocused.current = true)}
            onChange={(e) => (setStepsText(e.target.value), setError(null))}
            onBlur={saveSteps}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
          <span className="about-unit" aria-hidden="true">
            steps
          </span>
        </span>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="field">
        <span className="sprout-label" id="sprout-exercise-label">
          Exercise
        </span>
        <div className="measure-chips" role="group" aria-labelledby="sprout-exercise-label">
          {EXERCISE_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className={`measure-pill${chip === c ? ' active' : ''}`}
              aria-pressed={chip === c}
              onClick={() => {
                const next = chip === c ? '' : c;
                setExerciseText(next);
                void setExercise(date, next);
              }}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            className={`measure-pill${isCustom ? ' active' : ''}`}
            aria-pressed={isCustom}
            onClick={() => {
              if (chip) {
                setExerciseText('');
                void setExercise(date, '');
              }
              exerciseInput.current?.focus();
            }}
          >
            Custom
          </button>
        </div>
        <input
          ref={exerciseInput}
          className="input"
          aria-label="Exercise, in your own words"
          value={exercise}
          maxLength={EXERCISE_MAX}
          placeholder="e.g. A long walk with Mia"
          onFocus={() => (exerciseFocused.current = true)}
          onChange={(e) => setExerciseText(e.target.value)}
          onBlur={saveExercise}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      <label className="sprout-check">
        <input type="checkbox" checked={day.stretch} onChange={(e) => void setStretch(date, e.target.checked)} />
        <span className="list-check" aria-hidden="true">
          {day.stretch ? '✓' : ''}
        </span>
        <span>I stretched</span>
      </label>
    </section>
  );
}

function WaterCard({ date, water }: { date: string; water: number }) {
  const target = loadSettings().waterTarget;
  return (
    <section className="card sprout-card" aria-labelledby="sprout-water-heading">
      <h2 id="sprout-water-heading" className="sprout-card-title">
        Water <span className="optional">{water} of {target} glasses</span>
      </h2>
      <div className="water-row">
        {Array.from({ length: Math.max(target, water) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`glass${n <= water ? ' full' : ''}`}
            aria-label={`${n} ${n === 1 ? 'glass' : 'glasses'}`}
            aria-pressed={n <= water}
            onClick={() => void setWater(date, water === n ? n - 1 : n)}
          >
            <svg viewBox="0 0 24 28" aria-hidden="true">
              <path className="glass-water" d="M5.6 12h12.8l-1.3 12.2a2 2 0 0 1-2 1.8H8.9a2 2 0 0 1-2-1.8z" />
              <path className="glass-outline" d="M3.5 3h17l-2.3 21.2a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8z" />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}

function MedsCard({ date, day, meds, onAdded }: { date: string; day: Day; meds: Medication[]; onAdded: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [timing, setTiming] = useState('');
  const former = day.meds.filter((x) => !meds.some((m) => m.id === x.id));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addMedication(name, timing);
    setName('');
    setTiming('');
    setAdding(false);
    onAdded();
  }

  return (
    <section className="card sprout-card" aria-labelledby="sprout-meds-heading">
      <div className="sprout-card-head">
        <h2 id="sprout-meds-heading" className="sprout-card-title">
          Medications/Vitamins
        </h2>
        {meds.length > 0 && (
          <Link to="/journal/health/medications" className="sprout-link">
            Edit list
          </Link>
        )}
      </div>
      {meds.length === 0 && former.length === 0 && !adding && <p className="hint">Add the ones you take, with their usual time, to check them off each day.</p>}
      {(meds.length > 0 || former.length > 0) && (
        <ul className="list-items health-meds">
          {[...meds.map((m) => ({ id: m.id, name: m.name, timing: m.timing })), ...former.map((m) => ({ ...m, timing: '' }))].map((m) => {
            const taken = day.meds.some((x) => x.id === m.id);
            return (
              <li key={m.id} className={`list-item${taken ? ' taken' : ''}`}>
                <label className="list-item-main">
                  <input type="checkbox" checked={taken} onChange={() => void setMedTaken(date, m, !taken)} />
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
      {adding ? (
        <form className="sprout-inline-form" onSubmit={(e) => void add(e)}>
          <input className="input" aria-label="Medication or vitamin" value={name} maxLength={MED_NAME_MAX} placeholder="e.g. Iron" autoFocus onChange={(e) => setName(e.target.value)} />
          <input className="input" aria-label="Usual time" value={timing} maxLength={MED_TIMING_MAX} placeholder="Usual time, e.g. with breakfast" onChange={(e) => setTiming(e.target.value)} />
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={!name.trim()}>
              Add
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="saving-toggle sprout-add" onClick={() => setAdding(true)}>
          + Add a medication/vitamin
        </button>
      )}
    </section>
  );
}

function TodosCard({ date, todos }: { date: string; todos: Day['todos'] }) {
  const [text, setText] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await addTodo(date, text);
    setText('');
  }

  return (
    <section className="card sprout-card" aria-labelledby="sprout-todos-heading">
      <h2 id="sprout-todos-heading" className="sprout-card-title">
        To-dos
      </h2>
      {todos.length > 0 && (
        <ul className="list-items">
          {todos.map((t) => (
            <li key={t.id} className={`list-item${t.done ? ' taken' : ''}`}>
              <label className="list-item-main">
                <input type="checkbox" checked={t.done} onChange={() => void setTodoDone(date, t.id, !t.done)} />
                <span className="list-check" aria-hidden="true">
                  {t.done ? '✓' : ''}
                </span>
                <span className="list-item-text">{t.text}</span>
              </label>
              <button type="button" className="list-item-delete" aria-label={`Delete ${t.text}`} onClick={() => void deleteTodo(date, t.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="sprout-todo-form" onSubmit={(e) => void add(e)}>
        <input className="input" aria-label="New to-do" value={text} maxLength={TODO_MAX} placeholder="Add a to-do" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

/**
 * Daily Sprout: one page per day (arrows move between days). The day's food, movement, water, medications,
 * to-dos and, last, its quick entry. It's the same day record the Health Journey shows, so editing either updates both.
 */
export default function DailySprout() {
  const { date: param } = useParams();
  const navigate = useNavigate();
  const date = isValidDayKey(param ?? null) ? param! : todayKey();
  const version = useDataVersion();
  const [day, setDay] = useState<Day | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [medsVersion, setMedsVersion] = useState(0);
  const [failed, setFailed] = useState(false);

  // The assistant's "today"/"this" means the day on screen.
  useEffect(() => {
    setAssistantDay(date);
    return () => setAssistantDay(null);
  }, [date]);

  useEffect(() => {
    let active = true;
    moveOldTodoList()
      .catch(() => 0)
      .then(() => Promise.all([getHealthDay(date), listMedications()]))
      .then(([saved, list]) => {
        if (!active) return;
        setDay(draftOf(saved));
        setMeds(list);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [date, version, medsVersion]);

  const go = (n: number) => navigate(`/sprout/${shiftDay(date, n)}`, { replace: true });
  const label = dayName(date);

  return (
    <PageShell title="Daily Sprout" subtitle="One small page for each day." pet>
      <div className="sprout-daynav" role="group" aria-label="Day">
        <button type="button" className="month-nav" onClick={() => go(-1)} aria-label="Previous day">
          ‹
        </button>
        <div className="sprout-day" aria-live="polite">
          <strong>{label}</strong>
          {['Today', 'Tomorrow', 'Yesterday'].includes(label) && (
            <span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          )}
        </div>
        <button type="button" className="month-nav" onClick={() => go(1)} aria-label="Next day">
          ›
        </button>
      </div>
      {date !== todayKey() && (
        <button type="button" className="see-more sprout-today" onClick={() => navigate('/sprout', { replace: true })}>
          Back to today
        </button>
      )}
      {day && <IntentionLine key={date} date={date} intention={day.intention} />}

      {failed && (
        <div className="card form-error" role="alert">
          Couldn't read this day on this device.
        </div>
      )}
      {day && (
        <>
          <FoodCard date={date} foods={day.foods} />
          <MovementCard key={date} date={date} day={day} />
          <WaterCard date={date} water={day.water} />
          <MedsCard date={date} day={day} meds={meds} onAdded={() => setMedsVersion((v) => v + 1)} />
          <TodosCard date={date} todos={day.todos} />
        </>
      )}

      <QuickEntryPanel date={date} />
    </PageShell>
  );
}
