import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ui/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import AdminPage from './pages/admin/AdminPage';
import AgendaPage from './pages/agenda/AgendaPage';
import TrainerPage from './pages/trainer/TrainerPage';
import ChatPage from './pages/chat/ChatPage';
import ProfilePage from './pages/social/ProfilePage';
import SettingsPage from './pages/settings/SettingsPage';
import AboutPage from './pages/about/AboutPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/agenda" element={<ProtectedRoute><AgendaPage /></ProtectedRoute>} />
      <Route path="/treino" element={<ProtectedRoute><TrainerPage /></ProtectedRoute>} />
      {/* Módulo 1: a conversa aberta é `/mensagens/:id`; a lista é `/mensagens`. */}
      <Route path="/mensagens" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/mensagens/:id" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/perfil/:username" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/config" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/sobre" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
