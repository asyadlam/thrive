import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Journal from './pages/Journal';
import QuickEntryPage from './pages/QuickEntryPage';
import TalkEntryPage from './pages/TalkEntryPage';
import LookBackPage from './pages/LookBackPage';
import EntryDetailPage from './pages/EntryDetailPage';
import TimeCapsulePage from './pages/TimeCapsulePage';
import LetterPage from './pages/LetterPage';
import ListPage from './pages/ListPage';
import Growth from './pages/Growth';
import MyLife from './pages/MyLife';
import Learn from './pages/Learn';
import Settings from './pages/Settings';
import Help from './pages/Help';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="journal" element={<Journal />} />
        <Route path="journal/quick" element={<QuickEntryPage />} />
        <Route path="journal/talk/:id?" element={<TalkEntryPage />} />
        <Route path="journal/look-back" element={<LookBackPage />} />
        <Route path="journal/entry/:id" element={<EntryDetailPage />} />
        <Route path="journal/time-capsule" element={<TimeCapsulePage />} />
        <Route path="journal/time-capsule/:id" element={<LetterPage />} />
        <Route path="growth" element={<Growth />} />
        <Route path="my-life" element={<MyLife />} />
        <Route path="my-life/lists/:id" element={<ListPage />} />
        <Route path="learn" element={<Learn />} />
        <Route path="settings" element={<Settings />} />
        <Route path="help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
