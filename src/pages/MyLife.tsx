import PageShell from '../components/PageShell';
import GoalsSection from '../components/GoalsSection';
import HabitsSection from '../components/HabitsSection';
import ListsSection from '../components/ListsSection';

export default function MyLife() {
  return (
    <PageShell title="My Life" subtitle="The people, places and things that matter to you.">
      <GoalsSection />
      <HabitsSection />
      <ListsSection />
    </PageShell>
  );
}
