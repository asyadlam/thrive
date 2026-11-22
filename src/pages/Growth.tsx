import PageShell from '../components/PageShell';
import PositivesSection from '../components/PositivesSection';
import JourneysSection from '../components/JourneysSection';

export default function Growth() {
  return (
    <PageShell title="Growth" subtitle="See how far you've come." pet>
      <PositivesSection />
      <JourneysSection />
    </PageShell>
  );
}
