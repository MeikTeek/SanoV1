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
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<{ qrCode: string; secret: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) navigate('/', { replace: true }); }, [user, navigate]);

  // Ao entrar na etapa de configuração do 2FA, busca o QR Code
  useEffect(() => {
    if (step !== 'SETUP_2FA') return;
    api.post<{ qrCode: string; secret: string }>('/auth/2fa/setup').then(setQr).catch((e) => fail(e));
  }, [step]);

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Erro inesperado';
    setError(msg);
    if (/expirada|Não autenticado|inválida/i.test(msg) && step !== 'LOGIN' && !/Código/.test(msg)) setStep('LOGIN');
  };

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try { await fn(); } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const onLogin = run(async () => {
    const r = await api.post<{ step: AuthStep }>('/auth/login', { username, password });
    setPassword('');
    setStep(r.step);
  });

  const onChangePassword = run(async () => {
    const r = await api.post<{ step: AuthStep }>('/auth/change-password', { newPassword });
    setNewPassword('');
    setStep(r.step);
  });

  const onCode = (path: string) =>
    run(async () => {
      const r = await api.post<{ user: User }>(path, { code });
      setUser(r.user);
    });

  return (
    <div className="center">
      <div className="card auth-card">
        <h1 className="logo">Sano</h1>
        <p className="muted">Acesso restrito</p>

        {step === 'LOGIN' && (
          <form onSubmit={onLogin}>
            <label>Usuário<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required /></label>
            <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
            <button disabled={busy}>Entrar</button>
          </form>
        )}

        {step === 'CHANGE_PASSWORD' && (
          <form onSubmit={onChangePassword}>
            <p>Primeiro acesso: defina sua senha definitiva.</p>
            <label>Nova senha<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required /></label>
            <small className="muted">Mín. 12 caracteres, com maiúscula, minúscula, número e símbolo.</small>
            <button disabled={busy}>Salvar senha</button>
          </form>
        )}

        {step === 'SETUP_2FA' && (
          <form onSubmit={onCode('/auth/2fa/confirm')}>
            <p>Escaneie o QR Code no Google Authenticator (ou similar) e digite o código gerado.</p>
            {qr ? (
              <>
                <img className="qr" src={qr.qrCode} alt="QR Code 2FA" />
                <small className="muted">Chave manual: <code>{qr.secret}</code></small>
              </>
            ) : <p className="muted">Gerando QR Code…</p>}
            <label>Código de 6 dígitos<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} pattern="\d{6}" required /></label>
            <button disabled={busy || !qr}>Ativar 2FA e entrar</button>
          </form>
        )}

        {step === 'VERIFY_2FA' && (
          <form onSubmit={onCode('/auth/2fa/verify')}>
            <p>Digite o código do seu aplicativo autenticador.</p>
            <label>Código de 6 dígitos<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} pattern="\d{6}" autoFocus required /></label>
            <button disabled={busy}>Verificar</button>
          </form>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
