import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSectionAnchor } from './ListPreview';
import { GrowthIcon } from './icons';
import { formatDay, formatShortDay, todayKey } from '../lib/journal';
import { WEEKDAYS, addMonths, compareMonths, dayKey, fromDayKey, monthCells, monthLabel, type YearMonth } from '../lib/calendar';
import { listHealthDays, type HealthDay } from '../lib/health';
import { useDataVersion } from '../lib/dataEvents';

/** A short summary of what a day holds ("1,800 kcal · Gym · 6 glasses of water"). */
export function daySummary(d: HealthDay): string {
  const parts: string[] = [];
  if (d.calories !== null) parts.push(`${d.calories.toLocaleString()} kcal`);
  if (d.exercise) parts.push(d.exercise);
  if (d.steps !== null) parts.push(`${d.steps.toLocaleString()} steps`);
  if (d.water > 0) parts.push(`${d.water} ${d.water === 1 ? 'glass' : 'glasses'} of water`);
  if (d.meds.length) parts.push(`${d.meds.length} ${d.meds.length === 1 ? 'medication/vitamin' : 'medications/vitamins'}`);
  return parts.join(' · ');
}

export const healthDayLabel = (date: string) =>
  date === todayKey() ? 'Today' : date.slice(0, 4) === todayKey().slice(0, 4) ? formatShortDay(date) : `${formatShortDay(date)}, ${date.slice(0, 4)}`;

/**
 * Today, then a month calendar like Look back: a dot marks each day with something logged, and tapping any day
 * (up to today) opens it to log or look.
 */
export function HealthCalendar() {
  const navigate = useNavigate();
  const today = useMemo(() => todayKey(), []);
  const thisMonth = useMemo(() => fromDayKey(today), [today]);
  const [shown, setShown] = useState<YearMonth>({ year: thisMonth.year, month: thisMonth.month });
  const [days, setDays] = useState<Map<string, HealthDay>>(new Map());

  useEffect(() => {
    let active = true;
    listHealthDays()
      .then((all) => active && setDays(new Map(all.map((d) => [d.date, d]))))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const todayLog = days.get(today);
  const atCurrentMonth = compareMonths(shown, thisMonth) >= 0;

  return (
    <>
      <Link to={`/journal/health/day/${today}`} className="list-link">
        <span className="list-link-main">
          <span className="list-link-title">Today</span>
          <span className="list-link-meta">{todayLog ? daySummary(todayLog) : 'Nothing logged yet · tap to start'}</span>
        </span>
        <span className="quick-action-arrow" aria-hidden="true">›</span>
      </Link>

      <div className="card calendar health-calendar">
        <div className="calendar-header">
          <button type="button" className="month-nav" onClick={() => setShown((m) => addMonths(m, -1))} aria-label="Previous month">
            ‹
          </button>
          <h3 className="calendar-title" aria-live="polite">
            {monthLabel(shown)}
          </h3>
          <button type="button" className="month-nav" onClick={() => setShown((m) => addMonths(m, 1))} aria-label="Next month" disabled={atCurrentMonth}>
            ›
          </button>
        </div>
        <div className="calendar-grid" role="group" aria-label={monthLabel(shown)}>
          {WEEKDAYS.map((w) => (
            <span key={w} className="weekday" aria-hidden="true">
              {w.slice(0, 1)}
            </span>
          ))}
          {monthCells(shown).map((day, i) => {
            if (day === null) return <span key={`blank-${i}`} aria-hidden="true" />;
            const key = dayKey(shown.year, shown.month, day);
            const log = days.get(key);
            const logged = !!log;
            const kcal = log?.calories ?? null;
            const future = key > today;
            return (
              <button
                key={key}
                type="button"
                className={`day${key === today ? ' today' : ''}`}
                aria-label={`${formatDay(key)}, ${kcal !== null ? `${kcal.toLocaleString()} calories` : logged ? 'logged' : 'nothing logged'}`}
                aria-current={key === today ? 'date' : undefined}
                disabled={future}
                onClick={() => navigate(`/journal/health/day/${key}`)}
              >
                <span className="day-number">{day}</span>
                {kcal !== null ? (
                  <span className="day-kcal" aria-hidden="true">
                    {kcal.toLocaleString()}
                  </span>
                ) : (
                  <span className="day-marks" aria-hidden="true">
                    {logged && <span className="day-mark page" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="hint health-calendar-hint">Tap a day to log or look. Numbers are the day's calories; a dot means something else is logged.</p>
      </div>
    </>
  );
}

/**
 * Health Journey on the Journal tab (only shown when turned on in Settings): one card. Tapping it opens Today,
 * the calendar and Medications/Vitamins on their own page.
 */
export default function HealthSection() {
  const ref = useRef<HTMLDivElement>(null);
  useSectionAnchor('health', ref);
  const today = useMemo(() => todayKey(), []);
  const [todayLog, setTodayLog] = useState<HealthDay | null | undefined>(undefined);
  const version = useDataVersion(); // Daily Sprout or the assistant changed the day: show it

  useEffect(() => {
    let active = true;
    listHealthDays()
      .then((all) => active && setTodayLog(all.find((d) => d.date === today) ?? null))
      .catch(() => active && setTodayLog(null));
    return () => {
      active = false;
    };
  }, [today, version]);

  return (
    <div className="card health-card" ref={ref}>
      <Link to="/journal/health" className="health-card-main">
        <span className="quick-action-icon look-back-icon">
          <GrowthIcon />
        </span>
        <span className="quick-action-text">
          <strong>Health Journey</strong>
          <span>A small daily log, all by hand.</span>
        </span>
        <span className="quick-action-arrow" aria-hidden="true">›</span>
      </Link>
      <Link to={`/journal/health/day/${today}`} className="health-today-row">
        <span className="list-link-main">
          <span className="list-link-title">Today</span>
          <span className="list-link-meta">{todayLog ? daySummary(todayLog) : 'Nothing logged yet · tap to start'}</span>
        </span>
        <span className="quick-action-arrow" aria-hidden="true">›</span>
      </Link>
    </div>
  );
}
