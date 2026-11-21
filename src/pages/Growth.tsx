import PageShell from '../components/PageShell';
import AffirmationsSection from '../components/AffirmationsSection';
import PositivesSection from '../components/PositivesSection';

export default function Growth() {
  return (
    <PageShell title="Growth" subtitle="See how far you've come.">
      <AffirmationsSection />
      <PositivesSection />
    </PageShell>
  );
}
