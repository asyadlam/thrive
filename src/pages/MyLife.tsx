import PageShell from '../components/PageShell';
import AboutMeSection from '../components/AboutMeSection';
import MeasurementsSection from '../components/MeasurementsSection';
import ListsSection from '../components/ListsSection';

export default function MyLife() {
  return (
    <PageShell title="My Life" subtitle="The people, places and things that matter to you." pet>
      <AboutMeSection />
      <MeasurementsSection />
      <ListsSection />
    </PageShell>
  );
}
