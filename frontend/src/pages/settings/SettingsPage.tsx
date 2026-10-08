import { useEffect, useRef, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import { useAuth } from '../../context/AuthContext';
import { fileToScaledDataUrl, getProfile, removeAvatar, setAvatar, setDisplayName, type Profile } from '../../services/profile.service';

/**
 * Configurações pessoais: foto e nome de exibição.
 *
 * O nome de login (`username`) é gerenciado pelo admin e não muda aqui — o que
 * o usuário controla é como aparece na interface. A troca é limitada pelo
 * servidor a uma vez por período, e a tela mostra quantos dias faltam.
 */
export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProfile().then((p) => { setProfile(p); setName(p.displayName ?? p.username); }).catch((e) => setError(e.message));
  }, []);

  // Atualiza o avatar no topo assim que o perfil muda.
  useEffect(() => {
    if (profile?.avatarDataUrl !== undefined) {
      setUser((u) => (u ? { ...u, avatarDataUrl: profile.avatarDataUrl } : u));
    }
  }, [profile?.avatarDataUrl, setUser]);

  const flash = (msg: string) => { setOk(msg); setError(''); setTimeout(() => setOk(''), 3500); };

  const pickAvatar = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      // Reduz no navegador antes de enviar: foto de celular passa de 1 MB.
      const dataUrl = await fileToScaledDataUrl(file);
      setProfile(await setAvatar(dataUrl));
      flash('Foto atualizada.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const dropAvatar = async () => {
    setBusy(true);
    setError('');
    try {
      setProfile(await removeAvatar());
      flash('Foto removida.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await setDisplayName(name.trim());
      setProfile(next);
      setUser((u) => (u ? { ...u, displayName: next.displayName } : u));
      flash('Nome atualizado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const initials = (user?.displayName || user?.username || '?').slice(0, 2);
  const locked = profile ? !profile.canChangeName : false;

  return (
    <AppShell title="Configurações" status="perfil pessoal" workspace>
      <section className="card">
        <h2>Foto de perfil</h2>
        <div className="settings-avatar-row">
          <div className="avatar-preview">
            {profile?.avatarDataUrl
              ? <img src={profile.avatarDataUrl} alt="Sua foto de perfil" />
              : <span>{initials}</span>}
          </div>
          <div className="settings-avatar-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="visually-hidden"
              onChange={(e) => void pickAvatar(e.target.files?.[0])}
            />
            <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
              Escolher foto
            </button>
            {profile?.avatarDataUrl && (
              <button className="ghost" disabled={busy} onClick={() => void dropAvatar()}>Remover</button>
            )}
            <small className="muted">PNG, JPEG, WEBP ou GIF. A imagem é reduzida para 512 px antes do envio.</small>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Nome de exibição</h2>
        <p className="muted small">
          É assim que o Sano te chama. Seu usuário de login ({user?.username}) não muda.
        </p>
        <div className="inline settings-name-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            disabled={locked || busy}
            aria-label="Nome de exibição"
          />
          <button onClick={() => void saveName()} disabled={locked || busy || !name.trim()}>Salvar</button>
        </div>
        {locked && (
          <p className="hud-alert mt">
            Você trocou o nome recentemente. Próxima troca em {profile?.nameChangeAvailableInDays} dias.
          </p>
        )}
      </section>

      {error && <div className="error">{error}</div>}
      {ok && <div className="notice">{ok}</div>}
    </AppShell>
  );
}