import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { ErrorNotice } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [defaultCreds, setDefaultCreds] = useState(false);

  useEffect(() => {
    api.get('/auth/setup').then((d) => setDefaultCreds(d.defaultCredentials)).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-light">
          <span className="brand-mark" aria-hidden="true">BR</span>
          <div>
            <div className="brand-name">Board Register</div>
            <div className="brand-sub">Attendance management</div>
          </div>
        </div>
        <h1>Administrator sign in</h1>
        <ErrorNotice error={error} />
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {defaultCreds && <p className="login-hint">Default account: <code>admin</code> / <code>admin123</code> — change it in Settings after signing in.</p>}
      </form>
    </div>
  );
}
