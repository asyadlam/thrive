import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import { findLesson, readMinutes } from '../data/lessons';
import { loadSettings, setLessonRead } from '../lib/settings';

export default function LessonPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const lesson = findLesson(id);
  const [read, setRead] = useState(() => loadSettings().readLessons.includes(id));
  const back = { to: '/learn', label: 'Learn' };

  if (!lesson) {
    return (
      <PageShell title="Lesson" subtitle="" back={back}>
        <div className="card placeholder">This lesson couldn't be found.</div>
      </PageShell>
    );
  }

  function finish() {
    setLessonRead(lesson!.id, true);
    setRead(true);
    navigate('/learn');
  }

  return (
    <PageShell title={lesson.title} subtitle={`${readMinutes(lesson)} min read`} back={back}>
      <article className="card lesson-body">
        <p className="lesson-intro">{lesson.description}</p>
        {lesson.sections.map((section) => (
          <section key={section.heading} className="lesson-section">
            <h2>{section.heading}</h2>
            {section.paragraphs.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </section>
        ))}
      </article>

      <div className="lesson-finish">
        {read ? (
          <>
            <p className="save-status lesson-done">✓ You've read this one.</p>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setLessonRead(lesson.id, false);
                setRead(false);
              }}
            >
              Mark as not read
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary lesson-finish-btn" onClick={finish}>
            Finished reading
          </button>
        )}
      </div>
    </PageShell>
  );
}
