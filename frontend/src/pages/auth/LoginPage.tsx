import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { AuthStep, User } from '../../types';

type Step = 'LOGIN' | AuthStep;

export default function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) navigate('/', { replace: true }); }, [user, navigate]);

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    setError(msg);
  };

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try { await fn(); } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const onLogin = run(async () => {
    const r = await api.post<{ user?: User; step?: AuthStep }>('/auth/login', { username, password });
    setPassword('');
    if (r.step) setStep(r.step);
    else if (r.user) setUser(r.user);
  });

  const onChangePassword = run(async () => {
    const r = await api.post<{ user: User }>('/auth/change-password', { newPassword });
    setNewPassword('');
    setUser(r.user);
  });

  return (
    <div className="center">
      <div className="card auth-card">
        <h1 className="logo">Sano</h1>
        <p className="muted">Acesso restrito</p>

        {step === 'LOGIN' ? (
          <form onSubmit={onLogin}>
            <label>Usuário<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required /></label>
            <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
            <button disabled={busy}>Entrar</button>
          </form>
        ) : (
          <form onSubmit={onChangePassword}>
            <p>Primeiro acesso: defina sua senha definitiva.</p>
            <label>Nova senha<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required /></label>
            <small className="muted">Mín. 12 caracteres, com maiúscula, minúscula, número e símbolo.</small>
            <button disabled={busy}>Salvar senha e entrar</button>
          </form>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
