/**
 * Root component: authentication state and routes.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './lib/api';
import { FeedbackProvider } from './components/Feedback';
import { SettingsProvider } from './lib/settings';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Participants from './pages/Participants';
import ParticipantForm from './pages/ParticipantForm';
import ParticipantProfile from './pages/ParticipantProfile';
import Meetings from './pages/Meetings';
import MeetingForm from './pages/MeetingForm';
import MeetingDetail from './pages/MeetingDetail';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const login = useCallback(async (username, password) => {
    const d = await api.post('/auth/login', { username, password });
    setUser(d.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  if (user === undefined) return null;

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <SettingsProvider enabled={Boolean(user)}>
      <FeedbackProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="participants" element={<Participants />} />
              <Route path="participants/new" element={<ParticipantForm />} />
              <Route path="participants/:id" element={<ParticipantProfile />} />
              <Route path="participants/:id/edit" element={<ParticipantForm />} />
              <Route path="meetings" element={<Meetings />} />
              <Route path="meetings/new" element={<MeetingForm />} />
              <Route path="meetings/:id" element={<MeetingDetail />} />
              <Route path="meetings/:id/edit" element={<MeetingForm />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </FeedbackProvider>
      </SettingsProvider>
    </AuthContext.Provider>
  );
}
