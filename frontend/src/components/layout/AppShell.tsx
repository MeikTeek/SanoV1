import { Fragment, useEffect, useState, type ComponentType, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IconBell, IconBubble, IconCalendar, IconChat, IconDumbbell, IconInfo, IconLock, IconLogout, IconSettings, IconShield, IconUsers, IconMusic, IconWallet, IconRadar } from '../ui/icons';
import MusicPlayer from '../music/MusicPlayer';
import PageLoader, { usePageReady } from './PageLoader';
import { updatePresence } from '../../services/chat.service';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  /** Ativo também nas sub-rotas (ex.: /mensagens/:id). */
  prefix?: boolean;
  admin?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Chat com o Sano', Icon: IconChat },
  { to: '/agenda', label: 'Agenda', Icon: IconCalendar },
  { to: '/treino', label: 'Treino', Icon: IconDumbbell },
  { to: '/musica', label: 'Música', Icon: IconMusic },
  { to: '/financas', label: 'Finanças', Icon: IconWallet },
  { to: '/mensagens', label: 'Mensagens', Icon: IconBubble, prefix: true },
  { to: '/sobre', label: 'Sobre o Sano', Icon: IconInfo },
  { to: '/admin', label: 'Administração', Icon: IconShield, admin: true },
  { to: '/osint', label: 'OSINT', Icon: IconRadar, admin: true },
];

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
  // Cada módulo abre com a tela de carregamento até os dados chegarem; depois
  // ela some num fade e a página entra animada.
  const ready = usePageReady();
  const [loaderGone, setLoaderGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setLoaderGone(true), 320);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!('Notification' in window)) return;
    setNotify(Notification.permission === 'granted');
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setTip(null);
  }, [pathname]);

  // Esc fecha o menu da conta.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const askPermission = async () => {
    const p = await Notification.requestPermission();
    setNotify(p === 'granted');
  };

  const isActive = (item: NavItem) => (item.prefix ? pathname.startsWith(item.to) : pathname === item.to);

  /** Rótulo flutuante do rail: posicionado pelo item, fora do overflow do rail. */
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const showTip = (label: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };
  const tipProps = (label: string) => ({
    onMouseEnter: showTip(label),
    onFocus: showTip(label),
    onBlur: () => setTip(null),
  });
  const initials = (user?.displayName || user?.username || '?').slice(0, 2);

  useEffect(() => {
    if (!user) return;
    const activity = pathname === '/'
      ? 'Conversando com Sano'
      : pathname.startsWith('/agenda')
        ? 'Usando a agenda'
        : pathname.startsWith('/treino')
          ? 'Visualizando treino'
          : pathname.startsWith('/musica')
            ? 'Ouvindo música'
          : pathname.startsWith('/financas')
            ? 'Organizando as finanças'
          : pathname.startsWith('/mensagens')
            ? 'No chat'
            : pathname.startsWith('/config')
              ? 'Nas configurações'
              : pathname.startsWith('/osint')
                ? 'No painel OSINT'
              : pathname.startsWith('/admin')
                ? 'Na administração'
                : 'Lendo informações';

    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      updatePresence(activity).catch((e) => console.warn('Não foi possível atualizar a presença:', e));
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    document.addEventListener('visibilitychange', heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', heartbeat);
    };
  }, [pathname, user?.id]);

  return (
    <div className="app">
      <nav className="rail" aria-label="Navegação principal" onMouseLeave={() => setTip(null)}>
        <Link to="/" className="rail-brand" aria-label="Sano — início" {...tipProps('Sano')}>S</Link>
        {NAV.filter((item) => !item.admin || user?.role === 'ADMIN').map((item, index, list) => (
          <Fragment key={item.to}>
            {item.admin && !list[index - 1]?.admin && <span className="rail-sep" />}
            <Link
              to={item.to}
              className={`rail-link ${isActive(item) ? 'active' : ''}`}
              aria-label={item.label}
              aria-current={isActive(item) ? 'page' : undefined}
              {...tipProps(item.label)}
            >
              <item.Icon />
            </Link>
          </Fragment>
        ))}
      </nav>
      {tip && <span className="rail-tip" role="tooltip" style={{ top: tip.top }}>{tip.label}</span>}

      <div className="app-main">
        <header className="appbar">
          <div className="appbar-title">
            <h1>{title}</h1>
            {status && (
              <span className="sub">
                {/* Cadeado junto do rótulo: o termo "criptografia ponta a ponta"
                    sozinho soa como marketing; o ícone diz o que acontece. */}
                {title === 'Mensagens' && <IconLock size={12} />}
                {status}
              </span>
            )}
          </div>
          <div className="appbar-actions">
            {actions && <div className="appbar-extra">{actions}</div>}
            {!notify && 'Notification' in window && (
              <button
                className="icon-btn alert bell-pending"
                onClick={askPermission}
                title="Permite avisos de lembrete mesmo com a aba em segundo plano"
                aria-label="Ativar avisos"
              >
                <IconBell />
                <span className="bell-dot" aria-hidden="true" />
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
                      <span className="avatar" aria-hidden="true">
                        {user?.avatarDataUrl ? <img src={user.avatarDataUrl} alt="" /> : initials}
                      </span>
                      <div>
                        <b>{user?.displayName || user?.username}</b>
                        <span>@{user?.username} · {user?.role === 'ADMIN' ? 'Administrador' : 'Usuário'}</span>
                      </div>
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

        <div className="app-stage">
          <div className={`app-content ${ready ? 'revealed' : 'loading'}`} aria-busy={!ready}>
            {flush ? <div className="page flush">{children}</div> : <div className="page">{children}</div>}
          </div>
          {!loaderGone && <PageLoader label={title} leaving={ready} />}
        </div>
        <MusicPlayer />
      </div>
    </div>
  );
}