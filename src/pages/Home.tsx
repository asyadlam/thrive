import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import PetCompanion from '../components/PetCompanion';
import { JournalIcon } from '../components/icons';

export default function Home() {
  return (
    <PageShell title="Home" subtitle="A calm look at your day.">
      <PetCompanion />

      <h2 className="section-title">Quick actions</h2>
      <Link to="/journal" className="card quick-action">
        <span className="quick-action-icon">
          <JournalIcon />
        </span>
        <span className="quick-action-text">
          <strong>Write an entry</strong>
          <span>A quick check-in, or space to write it all out.</span>
        </span>
        <span className="quick-action-arrow" aria-hidden="true">›</span>
      </Link>
    </PageShell>
  );
}
