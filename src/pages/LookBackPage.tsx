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
  type JournalEntry,
} from '../lib/journal';

type Status = 'loading' | 'ready' | 'error';

const monthParam = ({ year, month }: YearMonth) => `${year}-${String(month + 1).padStart(2, '0')}`;

function sortForDay(entries: JournalEntry[]) {
  // Quick entry first, then journal pages oldest → newest.
  return [...entries].sort((a, b) =>
    a.type !== b.type ? (a.type === 'quick' ? -1 : 1) : a.createdAt.localeCompare(b.createdAt),
  );
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
  const [byDay, setByDay] = useState<Map<string, JournalEntry[]>>(new Map());

  useEffect(() => {
    let active = true;
    setStatus('loading');
    const { start, end } = monthRange(shown);
    listEntriesBetween(start, end)
      .then((entries) => {
        if (!active) return;
        const map = new Map<string, JournalEntry[]>();
        for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
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
            const count = byDay.get(key)?.length ?? 0;
            const isToday = key === today;
            const isSelected = key === selectedDay;
            const label = `${formatDay(key)}, ${count === 0 ? 'no entries' : count === 1 ? '1 entry' : `${count} entries`}`;
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
                <span className={`day-dot${count > 0 ? ' visible' : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
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
              <div className="card placeholder">No entries on this day.</div>
            ) : (
              <ul className="talk-list">
                {selectedEntries.map((e) => (
                  <li key={e.id}>
                    <Link to={`/journal/entry/${e.id}`} className="talk-list-item">
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
                            <span className="hint">Journal page · {formatTime(e.createdAt)}</span>
                          </span>
                        </>
                      )}
                      <span className="quick-action-arrow" aria-hidden="true">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}
