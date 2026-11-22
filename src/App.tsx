import { Navigate, Route, Routes } from 'react-router-dom';
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
import { AffirmationsPage, AllListsPage, GoalsPage, HabitsPage, JourneysPage, PositivesPage } from './pages/FullListPages';
import MyLife from './pages/MyLife';
import Learn from './pages/Learn';
import Settings from './pages/Settings';
import MemoryPage from './pages/MemoryPage';
import Help from './pages/Help';

export default function App() {
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
        <Route path="journal/time-capsule" element={<TimeCapsulePage />} />
        <Route path="journal/time-capsule/:id" element={<LetterPage />} />
        <Route path="growth" element={<Growth />} />
        <Route path="growth/positives" element={<PositivesPage />} />
        <Route path="growth/affirmations" element={<AffirmationsPage />} />
        <Route path="growth/journeys" element={<JourneysPage />} />
        <Route path="growth/journeys/:id" element={<JourneyPage />} />
        <Route path="my-life" element={<MyLife />} />
        <Route path="my-life/goals" element={<GoalsPage />} />
        <Route path="my-life/habits" element={<HabitsPage />} />
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
