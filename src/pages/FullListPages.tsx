/*
  The "See more" pages: each shows one list in full, with the same add / edit / delete
  as on its section page, and a link back to that section.
*/
import PageShell from '../components/PageShell';
import GoalsSection from '../components/GoalsSection';
import HabitsSection from '../components/HabitsSection';
import ListsSection from '../components/ListsSection';
import PositivesSection from '../components/PositivesSection';
import JourneysSection from '../components/JourneysSection';
import AffirmationsSection from '../components/AffirmationsSection';

const MY_LIFE = (section: string) => ({ to: `/my-life?section=${section}`, label: 'My Life' });
const GROWTH = (section: string) => ({ to: `/growth?section=${section}`, label: 'Growth' });

export function GoalsPage() {
  return (
    <PageShell title="My goals" subtitle="All your goals, newest first." back={MY_LIFE('goals')}>
      <GoalsSection full />
    </PageShell>
  );
}

export function HabitsPage() {
  return (
    <PageShell title="Habits" subtitle="Small swaps to try when a familiar moment comes up." back={MY_LIFE('habits')}>
      <HabitsSection full />
    </PageShell>
  );
}

export function AllListsPage() {
  return (
    <PageShell title="Lists" subtitle="Little collections, just for you." back={MY_LIFE('lists')}>
      <ListsSection full />
    </PageShell>
  );
}

export function PositivesPage() {
  return (
    <PageShell title="Positives" subtitle="Every good moment you've saved, newest first." back={GROWTH('positives')}>
      <PositivesSection full />
    </PageShell>
  );
}

export function JourneysPage() {
  return (
    <PageShell
      title="Fear & Confidence"
      subtitle="Build a ladder of small steps toward something that feels hard."
      back={GROWTH('journeys')}
    >
      <JourneysSection full />
    </PageShell>
  );
}

export function AffirmationsPage() {
  return (
    <PageShell title="Your affirmations" subtitle="The ones you've written yourself, newest first." back={GROWTH('affirmations')}>
      <AffirmationsSection full />
    </PageShell>
  );
}
