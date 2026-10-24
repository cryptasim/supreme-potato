import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AccuracyPage } from './pages/AccuracyPage';
import { DecisionDesk } from './pages/DecisionDesk';
import { MethodologyPage } from './pages/MethodologyPage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DecisionDesk />} />
        <Route path="/accuracy" element={<AccuracyPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
