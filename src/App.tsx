import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Journal from './pages/Journal';
import QuickEntryPage from './pages/QuickEntryPage';
import TalkEntryPage from './pages/TalkEntryPage';
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
        <Route path="growth" element={<Growth />} />
        <Route path="my-life" element={<MyLife />} />
        <Route path="learn" element={<Learn />} />
        <Route path="settings" element={<Settings />} />
        <Route path="help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
