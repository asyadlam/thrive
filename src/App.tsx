import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Today from './pages/Today';
import History from './pages/History';
import Trends from './pages/Trends';
import Goals from './pages/Goals';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="history" element={<History />} />
        <Route path="trends" element={<Trends />} />
        <Route path="goals" element={<Goals />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
