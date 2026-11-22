/*
  How older Growth data becomes Journeys. Pure functions with no imports, so the database upgrade (db.ts),
  backup restore and merge all convert the same way, with the same ids:
  - a ladder made before journeys had goals gets its aim as its goal;
  - a standalone goal becomes a journey named after it, holding that goal;
  - a standalone habit swap becomes a journey named from its "When…" moment, holding that swap.
  Ids are derived from the original ids ("journey-from-<id>"), so converting twice never makes duplicates.
*/

type GoalLike = { id: string; title: string; note: string; targetDate: string; completedAt: string | null; createdAt: string; updatedAt: string };
type HabitLike = { id: string; trigger: string; oldHabit: string; newHabit: string; createdAt: string; updatedAt: string };
type JourneyLike = {
  id: string;
  title: string;
  steps: unknown[];
  goal?: GoalLike | null;
  swaps?: HabitLike[];
  createdAt: string;
  updatedAt: string;
};

const NAME_MAX = 80;

/** A ladder from before goals existed (no `goal` field at all): its aim becomes its goal. Adds `swaps: []`. */
export function withJourneyParts<J extends JourneyLike>(j: J): J {
  const goal =
    j.goal === undefined
      ? { id: `goal-of-${j.id}`, title: j.title, note: '', targetDate: '', completedAt: null, createdAt: j.createdAt, updatedAt: j.updatedAt }
      : j.goal;
  return { ...j, goal, swaps: Array.isArray(j.swaps) ? j.swaps : [] };
}

export function journeyFromGoal(g: GoalLike): JourneyLike {
  return { id: `journey-from-${g.id}`, title: g.title.slice(0, NAME_MAX), steps: [], goal: g, swaps: [], createdAt: g.createdAt, updatedAt: g.updatedAt };
}

export function journeyFromHabit(h: HabitLike): JourneyLike {
  const moment = h.trigger.trim();
  // "I feel stressed" → "When I feel stressed"; "Plans change" → "When plans change"; "When…" stays as it is.
  const lowered = /^I\b/.test(moment) ? moment : `${moment.charAt(0).toLowerCase()}${moment.slice(1)}`;
  const title = (/^when\b/i.test(moment) ? moment : `When ${lowered}`).slice(0, NAME_MAX);
  return { id: `journey-from-${h.id}`, title, steps: [], goal: null, swaps: [h], createdAt: h.createdAt, updatedAt: h.updatedAt };
}

/** Journeys + standalone goals + standalone habit swaps → one list of journeys (no duplicates by id). */
export function foldIntoJourneys(journeys: JourneyLike[], goals: GoalLike[], habits: HabitLike[]): JourneyLike[] {
  const out = new Map<string, JourneyLike>();
  for (const j of journeys) out.set(j.id, withJourneyParts(j));
  for (const g of goals) {
    const j = journeyFromGoal(g);
    if (!out.has(j.id)) out.set(j.id, j);
  }
  for (const h of habits) {
    const j = journeyFromHabit(h);
    if (!out.has(j.id)) out.set(j.id, j);
  }
  return [...out.values()];
}
