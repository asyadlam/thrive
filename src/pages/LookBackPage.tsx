import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import {
  WEEKDAYS,
  addMonths,
  compareMonths,
  dayKey,
  fromDayKey,
  isValidDayKey,
  monthCells,
  monthLabel,
  monthRange,
  type YearMonth,
} from '../lib/calendar';
import {
  formatDay,
  formatShortDay,
  formatTime,
  listEntriesBetween,
  talkEntryLabel,
  todayKey,
  type Book,
  type JournalEntry,
} from '../lib/journal';
import EmptyState from '../components/EmptyState';
import EntryView from '../components/EntryView';
import { loadSettings } from '../lib/settings';

type Status = 'loading' | 'ready' | 'error';

const monthParam = ({ year, month }: YearMonth) => `${year}-${String(month + 1).padStart(2, '0')}`;

/** An entry on the calendar, with which journal it's from (dreams are stored separately). */
type DayEntry = JournalEntry & { book: Book };
/** The three kinds of writing a day can show: a quick entry, a journal page, a dream or nightmare. */
type Mark = 'quick' | 'page' | 'dream';
const markOf = (e: DayEntry): Mark => (e.book === 'dreams' ? 'dream' : e.type === 'quick' ? 'quick' : 'page');
const MARKS: { mark: Mark; label: string }[] = [
  { mark: 'page', label: 'Journal entry' },
  { mark: 'quick', label: 'Quick entry' },
  { mark: 'dream', label: 'Dream or nightmare' },
];

function sortForDay(entries: DayEntry[]) {
  // Quick entry first, then journal pages oldest → newest, then dreams oldest → newest.
  const rank = (e: DayEntry) => ({ quick: 0, page: 1, dream: 2 })[markOf(e)];
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
}

export default function LookBackPage() {
  const today = useMemo(() => todayKey(), []);
  const thisMonth = useMemo(() => fromDayKey(today), [today]);
  const [params, setParams] = useSearchParams();

  const selectedDay = isValidDayKey(params.get('day')) ? params.get('day') : null;
  const shown: YearMonth = useMemo(() => {
    const m = params.get('month');
    if (m && /^\d{4}-\d{2}$/.test(m) && isValidDayKey(`${m}-01`)) return fromDayKey(`${m}-01`);
    if (selectedDay) return fromDayKey(selectedDay);
    return { year: thisMonth.year, month: thisMonth.month };
  }, [params, selectedDay, thisMonth]);

  const [status, setStatus] = useState<Status>('loading');
  const [byDay, setByDay] = useState<Map<string, DayEntry[]>>(new Map());
  const [{ showDreams }] = useState(loadSettings);
  const marks = showDreams ? MARKS : MARKS.filter((m) => m.mark !== 'dream');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    const { start, end } = monthRange(shown);
    // Dreams only appear when Dreams & Nightmares is turned on in Settings.
    Promise.all([listEntriesBetween(start, end), showDreams ? listEntriesBetween(start, end, 'dreams') : Promise.resolve([])])
      .then(([journal, dreams]) => {
        if (!active) return;
        const map = new Map<string, DayEntry[]>();
        const add = (e: DayEntry) => map.set(e.date, [...(map.get(e.date) ?? []), e]);
        journal.forEach((e) => add({ ...e, book: 'journal' }));
        dreams.forEach((e) => add({ ...e, book: 'dreams' }));
        setByDay(map);
        setStatus('ready');
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [shown]);

  const atCurrentMonth = compareMonths(shown, thisMonth) >= 0;

  const goToMonth = (delta: number) => {
    setParams({ month: monthParam(addMonths(shown, delta)) }, { replace: true });
  };
  const selectDay = (key: string) => {
    setParams({ month: monthParam(shown), day: key }, { replace: true });
  };

  const selectedEntries = selectedDay ? sortForDay(byDay.get(selectedDay) ?? []) : [];
  const selectedInView = selectedDay && selectedDay.startsWith(monthParam(shown));

  return (
    <PageShell title="Look back" subtitle="Revisit what you've written." back={{ to: '/journal', label: 'Journal' }}>
      <div className="card calendar">
        <div className="calendar-header">
          <button type="button" className="month-nav" onClick={() => goToMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <h2 className="calendar-title" aria-live="polite">
            {monthLabel(shown)}
          </h2>
          <button
            type="button"
            className="month-nav"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
            disabled={atCurrentMonth}
          >
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
            const entries = byDay.get(key) ?? [];
            const count = entries.length;
            const kinds = new Set(entries.map(markOf));
            const kindsText = MARKS.filter((m) => kinds.has(m.mark)).map((m) => m.label.toLowerCase()).join(', ');
            const isToday = key === today;
            const isSelected = key === selectedDay;
            const label = `${formatDay(key)}, ${count === 0 ? 'no entries' : `${count === 1 ? '1 entry' : `${count} entries`}: ${kindsText}`}`;
            return (
              <button
                key={key}
                type="button"
                className={`day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                aria-label={label}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => selectDay(key)}
              >
                <span className="day-number">{day}</span>
                <span className="day-marks" aria-hidden="true">
                  {MARKS.filter((m) => kinds.has(m.mark)).map((m) => (
                    <span key={m.mark} className={`day-mark ${m.mark}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <ul className="calendar-legend" aria-label="What the marks mean">
          {marks.map((m) => (
            <li key={m.mark}>
              <span className={`day-mark ${m.mark}`} aria-hidden="true" />
              {m.label}
            </li>
          ))}
        </ul>
        {status === 'error' && (
          <p className="form-error" role="alert">
            Couldn't read your entries on this device.
          </p>
        )}
      </div>

      <section className="day-entries" aria-live="polite">
        {!selectedInView ? (
          <p className="hint day-hint">Tap a day to see its entries.</p>
        ) : (
          <>
            <h2 className="section-title">{formatDay(selectedDay)}</h2>
            {status === 'loading' ? (
              <p className="hint">Loading…</p>
            ) : selectedEntries.length === 0 ? (
              <EmptyState>No entries on this day.</EmptyState>
            ) : (
              <ul className="talk-list">
                {selectedEntries.map((e) =>
                  e.type === 'quick' && e.book !== 'dreams' ? (
                    // The day's quick entry, read-only here: it's edited on Daily Sprout.
                    <li key={e.id} className="lookback-quick">
                      <EntryView entry={e} openInSprout />
                    </li>
                  ) : (
                  <li key={e.id}>
                    <Link to={`${e.book === 'dreams' ? '/journal/dreams' : '/journal'}/entry/${e.id}`} className="talk-list-item">
                      {e.type === 'quick' ? (
                        <>
                          <span className="entry-item-main">
                            <span className="mood-pill small">{e.mood}</span>
                            <span className="hint">Quick entry · {formatShortDay(e.date)}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="entry-item-main">
                            <span className={`talk-list-label${e.title ? '' : ' untitled'}`}>{talkEntryLabel(e)}</span>
                            <span className="hint">
                              {e.book === 'dreams' ? 'Dream' : 'Journal page'} · {formatTime(e.createdAt)}
                            </span>
                          </span>
                        </>
                      )}
                      <span className="quick-action-arrow" aria-hidden="true">›</span>
                    </Link>
                  </li>
                  ),
                )}
              </ul>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}
