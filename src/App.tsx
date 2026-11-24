import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Welcome from './pages/Welcome';
import { WELCOME_EVENT, completeGoogleSignIn, hasGooglePending, needsWelcome } from './lib/cloud';
import Layout from './components/Layout';
import Home from './pages/Home';
import Journal from './pages/Journal';
import QuickEntryPage from './pages/QuickEntryPage';
import TalkEntryPage from './pages/TalkEntryPage';
import TalkChatPage from './pages/TalkChatPage';
import LookBackPage from './pages/LookBackPage';
import EntryDetailPage from './pages/EntryDetailPage';
import TimeCapsulePage from './pages/TimeCapsulePage';
import LetterPage from './pages/LetterPage';
import ListPage from './pages/ListPage';
import LessonPage from './pages/LessonPage';
import JourneyPage from './pages/JourneyPage';
import Growth from './pages/Growth';
import { HealthDayPage, HealthDaysPage, MedicationsPage } from './pages/HealthPages';
import { AllDreamsPage, AllListsPage, JourneysPage, PositivesPage } from './pages/FullListPages';
import AffirmationsPage from './pages/AffirmationsPage';
import MyLife from './pages/MyLife';
import Learn from './pages/Learn';
import Settings from './pages/Settings';
import MemoryPage from './pages/MemoryPage';
import Help from './pages/Help';

export default function App() {
  // One-time Welcome: only until the person logs in or chooses local-only use on this device.
  const [welcome, setWelcome] = useState(needsWelcome);
  // Coming back from "Continue with Google": wait for the result before showing anything (no flash of Welcome).
  const [returning, setReturning] = useState(hasGooglePending);
  const navigate = useNavigate();
  useEffect(() => {
    if (!returning) return;
    void completeGoogleSignIn().then((result) => {
      if (result === 'signed-in') setWelcome(false);
      else setWelcome(needsWelcome()); // didn't finish: back to the form it came from, with a plain message
      setReturning(false);
    });
  }, [returning]);
  // Log out / Delete account bring the Welcome screen back straight away (local data untouched).
  useEffect(() => {
    const show = () => {
      window.scrollTo(0, 0);
      setWelcome(true);
    };
    window.addEventListener(WELCOME_EVENT, show);
    return () => window.removeEventListener(WELCOME_EVENT, show);
  }, []);
  if (returning) return <div className="app-returning" aria-busy="true" />;
  if (welcome) {
    return (
      <Welcome
        onDone={() => {
          setWelcome(false);
          navigate('/', { replace: true });
        }}
      />
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="journal" element={<Journal />} />
        <Route path="journal/quick" element={<QuickEntryPage />} />
        <Route path="journal/talk/:id?" element={<TalkEntryPage />} />
        <Route path="journal/chat/:id?" element={<TalkChatPage />} />
        <Route path="journal/look-back" element={<LookBackPage />} />
        <Route path="journal/entry/:id" element={<EntryDetailPage />} />
        <Route path="journal/dreams" element={<AllDreamsPage />} />
        <Route path="journal/dreams/talk/:id?" element={<TalkEntryPage />} />
        <Route path="journal/dreams/chat/:id?" element={<TalkChatPage />} />
        <Route path="journal/dreams/look-back" element={<Navigate to="/journal/look-back" replace />} />
        <Route path="journal/dreams/entry/:id" element={<EntryDetailPage />} />
        <Route path="journal/health" element={<HealthDaysPage />} />
        <Route path="journal/health/day/:date" element={<HealthDayPage />} />
        <Route path="journal/health/medications" element={<MedicationsPage />} />
        <Route path="journal/time-capsule" element={<TimeCapsulePage />} />
        <Route path="journal/time-capsule/:id" element={<LetterPage />} />
        <Route path="growth" element={<Growth />} />
        <Route path="growth/positives" element={<PositivesPage />} />
        <Route path="affirmations" element={<AffirmationsPage />} />
        {/* goals and habit swaps now live inside journeys */}
        <Route path="growth/goals" element={<Navigate to="/growth" replace />} />
        <Route path="growth/habits" element={<Navigate to="/growth" replace />} />
        {/* old addresses from before goals/habits moved to Growth and affirmations moved to Home */}
        <Route path="growth/affirmations" element={<Navigate to="/affirmations" replace />} />
        <Route path="growth/journeys" element={<JourneysPage />} />
        <Route path="growth/journeys/:id" element={<JourneyPage />} />
        <Route path="my-life" element={<MyLife />} />
        <Route path="my-life/goals" element={<Navigate to="/growth" replace />} />
        <Route path="my-life/habits" element={<Navigate to="/growth" replace />} />
        <Route path="my-life/lists" element={<AllListsPage />} />
        <Route path="my-life/lists/:id" element={<ListPage />} />
        <Route path="learn" element={<Learn />} />
        <Route path="learn/:id" element={<LessonPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/memory" element={<MemoryPage />} />
        <Route path="help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
