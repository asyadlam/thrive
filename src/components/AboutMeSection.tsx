import { useState, type FormEvent } from 'react';
import { ABOUT_ME_MAX, USER_NAME_MAX, formatBirthday, loadSettings, saveSettings } from '../lib/settings';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'long' }));
const daysIn = (month: number) => new Date(2024, month, 0).getDate(); // 2024: Feb 29 allowed

/**
 * About me: name, birthday (no year) and a one-liner. The name is the same one used by the Home greeting
 * and Settings → About you (one setting), so editing it here changes it everywhere.
 */
export default function AboutMeSection() {
  const [settings, setSettings] = useState(loadSettings);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [month, setMonth] = useState(0); // 0 = not set
  const [day, setDay] = useState(0);
  const [about, setAbout] = useState('');
  const [message, setMessage] = useState('');

  function open() {
    const fresh = loadSettings(); // pick up a name changed elsewhere (e.g. Settings)
    setSettings(fresh);
    setName(fresh.userName);
    const [m, d] = fresh.birthday ? fresh.birthday.split('-').map(Number) : [0, 0];
    setMonth(m);
    setDay(d);
    setAbout(fresh.aboutMe);
    setMessage('');
    setEditing(true);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const birthday = month && day ? `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
    const next = { ...loadSettings(), userName: name.trim().slice(0, USER_NAME_MAX), birthday, aboutMe: about.trim().slice(0, ABOUT_ME_MAX) };
    if (!saveSettings(next)) {
      setMessage("Couldn't save in this browser.");
      return;
    }
    setSettings(next);
    setEditing(false);
    setMessage('Saved.');
  }

  const empty = !settings.userName && !settings.birthday && !settings.aboutMe;

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
                  else if (day > daysIn(m)) setDay(daysIn(m));
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
                {Array.from({ length: month ? daysIn(month) : 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
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
              <span className="saved-label">Birthday</span> {formatBirthday(settings.birthday)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
