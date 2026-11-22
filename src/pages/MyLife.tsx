import PageShell from '../components/PageShell';
import AboutMeSection from '../components/AboutMeSection';
import WishlistSection from '../components/WishlistSection';
import BucketListSection from '../components/BucketListSection';
import ListsSection from '../components/ListsSection';

export default function MyLife() {
  return (
    <PageShell title="My Life" subtitle="The people, places and things that matter to you." pet>
      <AboutMeSection />
      <WishlistSection />
      <BucketListSection />
      <ListsSection />
    </PageShell>
  );
}
