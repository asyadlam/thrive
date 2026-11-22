import PageShell from '../components/PageShell';
import GoalsSection from '../components/GoalsSection';
import HabitsSection from '../components/HabitsSection';

export default function MyLife() {
  return (
    <PageShell title="My Life" subtitle="The people, places and things that matter to you.">
      <GoalsSection />
      <HabitsSection />
    </PageShell>
  );
}
