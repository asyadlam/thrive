import { useState, type FormEvent } from 'react';
import {
  ABOUT_ME_MAX,
  BLOOD_TYPES,
  HEIGHT_CM,
  USER_NAME_MAX,
  WEIGHT_KG,
  feetAndInches,
  FIRST_BIRTH_YEAR,
  formatBirthday,
  loadSettings,
  poundsFrom,
  roundOne,
  saveSettings,
  showNumber,
  type BloodType,
} from '../lib/settings';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'long' }));
/** Days in a month; without a year, 2024 (a leap year) so Feb 29 is allowed. */
const daysIn = (month: number, year = 0) => new Date(year || 2024, month, 0).getDate();
const YEARS = Array.from({ length: new Date().getFullYear() - FIRST_BIRTH_YEAR + 1 }, (_, i) => new Date().getFullYear() - i);

/** "" → null (blank is fine); a number in range → that number; anything else → NaN (shows a gentle error). */
function readNumber(text: string, range: { min: number; max: number }): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= range.min && n <= range.max ? roundOne(n) : NaN;
}

/**
 * About me: name, birthday (year optional), a one-liner and (optionally) blood type, height and weight. The name is the same one used by the Home greeting
 * and Settings → About you (one setting), so editing it here changes it everywhere.
 */
export default function AboutMeSection() {
  const [settings, setSettings] = useState(loadSettings);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [month, setMonth] = useState(0); // 0 = not set
  const [day, setDay] = useState(0);
  const [year, setYear] = useState(0); // 0 = not set
  const [about, setAbout] = useState('');
  const [blood, setBlood] = useState<BloodType | ''>('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  function open() {
    const fresh = loadSettings(); // pick up a name changed elsewhere (e.g. Settings)
    setSettings(fresh);
    setName(fresh.userName);
    const [m, d] = fresh.birthday ? fresh.birthday.split('-').map(Number) : [0, 0];
    setMonth(m);
    setDay(d);
    setYear(fresh.birthYear ?? 0);
    setAbout(fresh.aboutMe);
    setBlood(fresh.bloodType);
    setHeight(fresh.heightCm === null ? '' : showNumber(fresh.heightCm));
    setWeight(fresh.weightKg === null ? '' : showNumber(fresh.weightKg));
    setError(null);
    setMessage('');
    setEditing(true);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const heightCm = readNumber(height, HEIGHT_CM);
    const weightKg = readNumber(weight, WEIGHT_KG);
    if (Number.isNaN(heightCm)) return setError(`Height should be a number in cm, like 165 (or leave it blank).`);
    if (Number.isNaN(weightKg)) return setError(`Weight should be a number in kg, like 60 (or leave it blank).`);
    const birthday = month && day ? `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
    const birthYear = birthday && year ? year : null; // a year is only kept with a birthday
    const next = { ...loadSettings(), userName: name.trim().slice(0, USER_NAME_MAX), birthday, birthYear, aboutMe: about.trim().slice(0, ABOUT_ME_MAX), bloodType: blood, heightCm, weightKg };
    if (!saveSettings(next)) {
      setMessage("Couldn't save in this browser.");
      return;
    }
    setSettings(next);
    setEditing(false);
    setMessage('Saved.');
  }

  const empty =
    !settings.userName && !settings.birthday && !settings.aboutMe && !settings.bloodType && settings.heightCm === null && settings.weightKg === null;
  const typedHeight = readNumber(height, HEIGHT_CM);
  const typedWeight = readNumber(weight, WEIGHT_KG);

  return (
    <section className="about-me" aria-labelledby="about-me-heading">
      <div className="goals-header">
        <h2 id="about-me-heading" className="section-title">
          About me
        </h2>
        {!editing && (
          <button type="button" className="btn-secondary btn-small" onClick={open}>
            Edit
          </button>
        )}
      </div>
      <p className="save-status" role="status">
        {message}
      </p>

      {editing ? (
        <form className="card positive-form about-form" onSubmit={save} noValidate>
          <div className="field">
            <label htmlFor="about-name">Name</label>
            <input
              id="about-name"
              className="input"
              value={name}
              maxLength={USER_NAME_MAX}
              autoComplete="given-name"
              placeholder="Your first name or a nickname"
              onChange={(e) => setName(e.target.value)}
            />
            <p className="hint">Also used for your greeting on Home.</p>
          </div>
          <fieldset className="field">
            <legend>
              Birthday <span className="optional">(optional)</span>
            </legend>
            <div className="birthday-row">
              <label htmlFor="birthday-month" className="sr-only">
                Month
              </label>
              <select
                id="birthday-month"
                className="input"
                value={month}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setMonth(m);
                  if (!m) setDay(0);
                  else if (day > daysIn(m, year)) setDay(daysIn(m, year));
                }}
              >
                <option value={0}>Month</option>
                {MONTHS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <label htmlFor="birthday-day" className="sr-only">
                Day
              </label>
              <select id="birthday-day" className="input" value={day} disabled={!month} onChange={(e) => setDay(Number(e.target.value))}>
                <option value={0}>Day</option>
                {Array.from({ length: month ? daysIn(month, year) : 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <label htmlFor="birthday-year" className="sr-only">
                Year (optional)
              </label>
              <select
                id="birthday-year"
                className="input"
                value={year}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setYear(y);
                  if (month && day > daysIn(month, y)) setDay(daysIn(month, y)); // Feb 29 in a non-leap year
                }}
              >
                <option value={0}>Year</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="about-line">
              About me <span className="optional">(optional)</span>
            </label>
            <input
              id="about-line"
              className="input"
              value={about}
              maxLength={ABOUT_ME_MAX}
              placeholder="e.g. Plant parent, slow walker, tea over coffee"
              onChange={(e) => setAbout(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="about-blood">
              Blood type <span className="optional">(optional)</span>
            </label>
            <select id="about-blood" className="input blood-select" value={blood} onChange={(e) => setBlood(e.target.value as BloodType | '')}>
              <option value="">Not set</option>
              {BLOOD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="about-height">
              Height <span className="optional">(optional)</span>
            </label>
            <div className="about-number-row">
              <span className="about-number">
                <input
                  id="about-height"
                  className="input"
                  inputMode="decimal"
                  value={height}
                  placeholder="e.g. 165"
                  aria-describedby="about-height-other"
                  onChange={(e) => (setHeight(e.target.value), setError(null))}
                />
                <span className="about-unit" aria-hidden="true">cm</span>
              </span>
              <span id="about-height-other" className="about-convert" aria-live="polite">
                {typedHeight !== null && !Number.isNaN(typedHeight) ? `${feetAndInches(typedHeight)}` : ''}
              </span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="about-weight">
              Weight <span className="optional">(optional)</span>
            </label>
            <div className="about-number-row">
              <span className="about-number">
                <input
                  id="about-weight"
                  className="input"
                  inputMode="decimal"
                  value={weight}
                  placeholder="e.g. 60"
                  aria-describedby="about-weight-other"
                  onChange={(e) => (setWeight(e.target.value), setError(null))}
                />
                <span className="about-unit" aria-hidden="true">kg</span>
              </span>
              <span id="about-weight-other" className="about-convert" aria-live="polite">
                {typedWeight !== null && !Number.isNaN(typedWeight) ? poundsFrom(typedWeight) : ''}
              </span>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : empty ? (
        <div className="card placeholder">Tell Thrive a little about you whenever you like.</div>
      ) : (
        <div className="about-view">
          <p className="about-name">{settings.userName || 'Your name'}</p>
          {settings.aboutMe && <p className="about-line">{settings.aboutMe}</p>}
          {settings.birthday && (
            <p className="about-birthday">
              <span className="saved-label">Birthday</span> {formatBirthday(settings.birthday, settings.birthYear)}
            </p>
          )}
          {settings.bloodType && (
            <p className="about-birthday">
              <span className="saved-label">Blood type</span> {settings.bloodType}
            </p>
          )}
          {settings.heightCm !== null && (
            <p className="about-birthday">
              <span className="saved-label">Height</span> {showNumber(settings.heightCm)} cm · {feetAndInches(settings.heightCm)}
            </p>
          )}
          {settings.weightKg !== null && (
            <p className="about-birthday">
              <span className="saved-label">Weight</span> {showNumber(settings.weightKg)} kg · {poundsFrom(settings.weightKg)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
