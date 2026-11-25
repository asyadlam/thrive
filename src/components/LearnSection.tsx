import { Link } from 'react-router-dom';
import { LearnIcon } from './icons';
import { LESSONS } from '../data/lessons';

/** Growth → Learn: one entry (with its lightbulb) that opens the Learn page and its lessons. */
export default function LearnSection() {
  return (
    <Link to="/learn" className="card choice-card look-back-card learn-entry">
      <span className="quick-action-icon look-back-icon">
        <LearnIcon />
      </span>
      <span className="quick-action-text">
        <strong>Learn</strong>
        <span>{LESSONS.length} short lessons to help you thrive.</span>
      </span>
      <span className="quick-action-arrow" aria-hidden="true">›</span>
    </Link>
  );
}
