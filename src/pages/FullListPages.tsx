/*
  The "See more" pages: each shows one list in full, with the same add / edit / delete
  as on its section page, and a link back to that section.
*/
import PageShell from '../components/PageShell';
import ListsSection from '../components/ListsSection';
import PositivesSection from '../components/PositivesSection';
import JourneysSection from '../components/JourneysSection';
import DreamsSection from '../components/DreamsSection';

const MY_LIFE = (section: string) => ({ to: `/my-life?section=${section}`, label: 'My Life' });
const GROWTH = (section: string) => ({ to: `/growth?section=${section}`, label: 'Growth' });

export function AllListsPage() {
  return (
    <PageShell title="Lists" subtitle="Little collections, just for you." back={MY_LIFE('lists')}>
      <ListsSection full />
    </PageShell>
  );
}

export function PositivesPage() {
  return (
    <PageShell title="Positives" subtitle="Your most recent good moments, newest first." back={GROWTH('positives')}>
      <PositivesSection full />
    </PageShell>
  );
}

export function JourneysPage() {
  return (
    <PageShell
      title="Journeys"
      subtitle="Each one thing you're working on — its goal, small steps and habits to change."
      back={GROWTH('journeys')}
    >
      <JourneysSection full />
    </PageShell>
  );
}

export function AllDreamsPage() {
  return (
    <PageShell title="Dreams & Nightmares" subtitle="What your nights bring you." back={{ to: '/journal?section=dreams', label: 'Journal' }}>
      <DreamsSection full />
    </PageShell>
  );
}
