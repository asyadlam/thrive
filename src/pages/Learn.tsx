import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import { LESSONS, readMinutes } from '../data/lessons';
import { loadSettings } from '../lib/settings';

export default function Learn() {
  const [readIds] = useState(() => new Set(loadSettings().readLessons));

  return (
    <PageShell title="Learn" subtitle="Ideas and tools to help you thrive.">
      <ul className="lesson-list">
        {LESSONS.map((lesson) => {
          const read = readIds.has(lesson.id);
          return (
            <li key={lesson.id}>
              <Link to={`/learn/${lesson.id}`} className="card lesson-card">
                <span className="lesson-card-text">
                  <strong className="lesson-card-title">{lesson.title}</strong>
                  <span className="lesson-card-desc">{lesson.description}</span>
                  <span className="lesson-card-meta">
                    <span>{readMinutes(lesson)} min</span>
                    {read && <span className="lesson-read-mark">✓ Read</span>}
                  </span>
                </span>
                <span className="quick-action-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="learn-note">These lessons are general wellbeing information, not medical advice.</p>
    </PageShell>
  );
}
