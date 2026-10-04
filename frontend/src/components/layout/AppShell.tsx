import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IconBell, IconBubble, IconCalendar, IconChat, IconDumbbell, IconLogout, IconSettings, IconShield, IconUsers } from '../ui/icons';

interface Props {
  /** Título da tela e linha de status ao lado. */
  title: string;
  status?: string;
  /** Ações específicas da tela (botões ghost à esquerda do sino). */
  actions?: ReactNode;
  /** Chat ocupa a altura toda, sem padding de página. */
  flush?: boolean;
  children: ReactNode;
}

/**
 * Casca do app: rail de ícones à esquerda (barra inferior no celular) + topbar
 * enxuta. Concentra o que era menu de topo: navegação, sino de avisos e as
 * ações da conta (sair) num menu ligado ao avatar.
 */
export default function AppShell({ title, status, actions, flush, children }: Props) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notify, setNotify] = useState(false);

  useEffect(() => {
    if (!('Notification' in window)) return;
    setNotify(Notification.permission === 'granted');
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  const askPermission = async () => {
    const p = await Notification.requestPermission();
    setNotify(p === 'granted');
  };

  const is = (path: string) => pathname === path;
  const initials = (user?.displayName || user?.username || '?').slice(0, 2);

  return (
    <div className="app">
      <nav className="rail" aria-label="Navegação principal">
        <Link to="/" className={`rail-link ${is('/') ? 'active' : ''}`} title="Chat"><IconChat /></Link>
        <Link to="/agenda" className={`rail-link ${is('/agenda') ? 'active' : ''}`} title="Agenda"><IconCalendar /></Link>
        <Link to="/treino" className={`rail-link ${is('/treino') ? 'active' : ''}`} title="Treino"><IconDumbbell /></Link>
        <Link
          to="/mensagens"
          className={`rail-link ${pathname.startsWith('/mensagens') ? 'active' : ''}`}
          title="Mensagens (criptografadas)"
        >
          <IconBubble />
        </Link>
        <Link
          to="/pessoas"
          className={`rail-link ${is('/pessoas') || pathname.startsWith('/perfil/') ? 'active' : ''}`}
          title="Pessoas e perfis"
        >
          <IconUsers />
        </Link>
        {user?.role === 'ADMIN' && (
          <>
            <span className="rail-sep" />
            <Link to="/admin" className={`rail-link ${is('/admin') ? 'active' : ''}`} title="Painel administrativo"><IconShield /></Link>
          </>
        )}
      </nav>

      <div className="app-main">
        <header className="appbar">
          <div className="appbar-title">
            <h1>{title}</h1>
            {status && <span className="sub">{status}</span>}
          </div>
          <div className="appbar-actions">
            {actions && <div className="appbar-extra">{actions}</div>}
            {!notify && 'Notification' in window && (
              <button
                className="icon-btn alert"
                onClick={askPermission}
                title="Permite avisos de lembrete mesmo com a aba em segundo plano"
                aria-label="Ativar avisos"
              >
                <IconBell />
              </button>
            )}
            <div className="menu-wrap">
              <button
                className="avatar"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Conta"
                title={user?.displayName || user?.username || ''}
              >
                {user?.avatarDataUrl
                  ? <img src={user.avatarDataUrl} alt="" />
                  : initials}
              </button>
              {menuOpen && (
                <>
                  <div className="backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="menu" role="menu">
                    <div className="menu-head">
                      <b>{user?.displayName || user?.username}</b>
                      <span>{user?.role === 'ADMIN' ? 'Administrador' : 'Usuário'}</span>
                    </div>
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); navigate(`/perfil/${user?.username}`); }}
                    >
                      <IconUsers /> Meu perfil
                    </button>
                    <button className="menu-item" role="menuitem" onClick={() => { setMenuOpen(false); navigate('/config'); }}>
                      <IconSettings /> Configurações
                    </button>
                    <button className="menu-item danger" role="menuitem" onClick={() => { setMenuOpen(false); void logout(); }}>
                      <IconLogout /> Sair
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="app-content">
          {flush ? <div className="page flush">{children}</div> : <div className="page">{children}</div>}
        </div>
      </div>
    </div>
  );
}