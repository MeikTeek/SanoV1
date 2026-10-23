import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import AppShell from '../../components/layout/AppShell';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { AdminUser, AuditLog, Role } from '../../types';
import {
  IconCopy, IconKey, IconLock, IconPlus, IconSearch, IconShield, IconUserPlus, IconUsers,
} from '../../components/ui/icons';
import '../../styles/admin.css';

/* ------------------------------- utilidades ------------------------------- */

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR');

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" ou a data. */
const timeAgo = (iso: string | null) => {
  if (!iso) return 'nunca';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 172_800) return 'ontem';
  if (diff < 30 * 86_400) return `há ${Math.floor(diff / 86_400)} dias`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

const initialsOf = (u: { displayName: string | null; username: string }) =>
  (u.displayName || u.username).trim().slice(0, 2).toUpperCase();

function UserAvatar({ user, size = 40 }: { user: AdminUser; size?: number }) {
  return (
    <span className={`admin-avatar${user.active ? '' : ' off'}`} style={{ width: size, height: size }} aria-hidden="true">
      {user.avatarDataUrl ? <img src={user.avatarDataUrl} alt="" /> : initialsOf(user)}
    </span>
  );
}

/** Texto copiado com retorno visual de 1,8 s. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
  };
  return { copied, copy };
}

/* ----------------------------- confirmação ------------------------------ */

interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void> | void;
}

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const confirm = async () => {
    setBusy(true);
    try { await state.run(); } finally { setBusy(false); onClose(); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title">
        <span className={`admin-confirm-icon${state.danger ? ' danger' : ''}`}><IconShield size={22} /></span>
        <h2 id="admin-confirm-title">{state.title}</h2>
        <div className="admin-confirm-body">{state.body}</div>
        <div className="admin-confirm-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className={state.danger ? 'danger' : ''} onClick={() => void confirm()} disabled={busy} autoFocus>
            {busy ? 'Aguarde…' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- página -------------------------------- */

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'logs'>('users');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get<{ users: AdminUser[] }>('/admin/users')
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const stats = useMemo(() => {
    const list = users ?? [];
    return {
      total: list.length,
      active: list.filter((u) => u.active).length,
      twoFactor: list.filter((u) => u.twoFactorEnabled).length,
      admins: list.filter((u) => u.role === 'ADMIN').length,
      pending: list.filter((u) => u.mustChangePassword).length,
    };
  }, [users]);

  return (
    <AppShell title="Administração" status="área restrita">
      <div className="admin">
        <section className="admin-stats stagger" aria-label="Resumo das contas">
          <StatCard i={0} icon={<IconUsers size={20} />} label="Contas" value={stats.total} loading={!users} />
          <StatCard i={1} icon={<IconLock size={20} />} label="Ativas" value={stats.active} hint={`${stats.total - stats.active} desativada(s)`} tone="ok" loading={!users} />
          <StatCard
            i={2}
            icon={<IconKey size={20} />}
            label="Com 2FA"
            value={stats.twoFactor}
            hint={stats.total ? `${Math.round((stats.twoFactor / stats.total) * 100)}% das contas` : undefined}
            progress={stats.total ? stats.twoFactor / stats.total : 0}
            tone="accent"
            loading={!users}
          />
          <StatCard i={3} icon={<IconShield size={20} />} label="Administradores" value={stats.admins} hint={stats.pending ? `${stats.pending} aguardando 1º acesso` : 'nenhum acesso pendente'} tone="warn" loading={!users} />
        </section>

        <div className="admin-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'users'} className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
            <IconUsers size={16} /> Usuários {users && <span className="admin-tab-count">{users.length}</span>}
          </button>
          <button role="tab" aria-selected={tab === 'logs'} className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>
            <IconShield size={16} /> Logs de segurança
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {tab === 'users'
          ? <UsersTab users={users} reload={load} onError={setError} />
          : <LogsTab />}
      </div>
    </AppShell>
  );
}

function StatCard({
  i, icon, label, value, hint, tone, progress, loading,
}: {
  i: number; icon: ReactNode; label: string; value: number; hint?: string;
  tone?: 'ok' | 'accent' | 'warn'; progress?: number; loading?: boolean;
}) {
  return (
    <article className={`admin-stat${tone ? ` tone-${tone}` : ''}`} style={{ '--i': i } as React.CSSProperties}>
      <span className="admin-stat-icon">{icon}</span>
      <div className="admin-stat-body">
        <span className="admin-stat-label">{label}</span>
        {loading ? <span className="skeleton admin-stat-skeleton" /> : <b className="admin-stat-value">{value}</b>}
        {hint && !loading && <small>{hint}</small>}
      </div>
      {progress !== undefined && !loading && (
        <span className="admin-stat-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
      )}
    </article>
  );
}

/* -------------------------------- usuários ------------------------------- */

type Filter = 'all' | 'active' | 'inactive' | 'admin' | 'no2fa';
const FILTERS: [Filter, string][] = [
  ['all', 'Todos'], ['active', 'Ativos'], ['inactive', 'Desativados'], ['admin', 'Admins'], ['no2fa', 'Sem 2FA'],
];

function UsersTab({ users, reload, onError }: { users: AdminUser[] | null; reload: () => void; onError: (m: string) => void }) {
  const { user: currentUser } = useAuth();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState<{ username: string; password: string; reset?: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { copied, copy } = useCopy();

  const validName = /^[a-z0-9_.-]{3,32}$/.test(username.trim().toLowerCase());

  const guard = async (fn: () => Promise<void>) => {
    onError('');
    try { await fn(); reload(); } catch (e) { onError((e as Error).message); }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!validName) return;
    setCreating(true);
    void guard(async () => {
      const r = await api.post<{ user: AdminUser; tempPassword: string }>('/admin/users', { username, role });
      setTemp({ username: r.user.username, password: r.tempPassword });
      setUsername('');
      setRole('USER');
    }).finally(() => setCreating(false));
  };

  const toggle = (u: AdminUser) => {
    const active = !u.active;
    const run = () => guard(async () => { await api.patch(`/admin/users/${u.id}/active`, { active }); });
    if (active) { void run(); return; }
    setConfirm({
      title: `Desativar o login de @${u.username}?`,
      body: <p>A pessoa deixa de conseguir entrar, mas a conta e todos os dados são preservados. Você pode reativar quando quiser.</p>,
      confirmLabel: 'Desativar login',
      danger: true,
      run,
    });
  };

  const reset = (u: AdminUser) => {
    setConfirm({
      title: `Resetar acesso de @${u.username}?`,
      body: (
        <p>
          Uma nova senha temporária será gerada e o <b>2FA será removido</b>. No próximo login a pessoa
          precisará trocar a senha e configurar o autenticador de novo.
        </p>
      ),
      confirmLabel: 'Resetar senha e 2FA',
      danger: true,
      run: () => guard(async () => {
        const r = await api.post<{ tempPassword: string }>(`/admin/users/${u.id}/reset`);
        setTemp({ username: u.username, password: r.tempPassword, reset: true });
      }),
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (filter === 'active' && !u.active) return false;
      if (filter === 'inactive' && u.active) return false;
      if (filter === 'admin' && u.role !== 'ADMIN') return false;
      if (filter === 'no2fa' && u.twoFactorEnabled) return false;
      if (!q) return true;
      return u.username.includes(q) || (u.displayName ?? '').toLowerCase().includes(q) || u.id.startsWith(q);
    });
  }, [users, query, filter]);

  return (
    <div className="admin-users">
      <section className="admin-panel admin-list-panel">
        <div className="admin-toolbar">
          <label className="admin-search">
            <IconSearch size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, @usuário ou ID"
              aria-label="Buscar usuários"
              spellCheck={false}
            />
          </label>
          <div className="admin-filters" role="group" aria-label="Filtrar usuários">
            {FILTERS.map(([key, label]) => (
              <button key={key} className={filter === key ? 'active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-user-list">
          {!users && [0, 1, 2].map((n) => (
            <div key={n} className="admin-user-row is-loading">
              <span className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
              <span className="skeleton" style={{ width: '40%', height: 14 }} />
            </div>
          ))}

          {users && visible.length === 0 && (
            <div className="admin-empty">
              <IconSearch size={24} />
              <b>Nenhum usuário encontrado</b>
              <span>Tente outro termo ou limpe o filtro.</span>
            </div>
          )}

          <div className="stagger">
            {visible.map((u, i) => {
              const isMe = u.id === currentUser?.id;
              const open = expanded === u.id;
              return (
                <article key={u.id} className={`admin-user-row${open ? ' open' : ''}${u.active ? '' : ' inactive'}`} style={{ '--i': i } as React.CSSProperties}>
                  <button className="admin-user-main" onClick={() => setExpanded(open ? null : u.id)} aria-expanded={open}>
                    <UserAvatar user={u} />
                    <span className="admin-user-name">
                      <b>
                        {u.displayName || u.username}
                        {isMe && <span className="admin-you">você</span>}
                      </b>
                      <small>@{u.username} · último login {timeAgo(u.lastLoginAt)}</small>
                    </span>
                    <span className="admin-user-pills">
                      <span className={`pill plain ${u.role === 'ADMIN' ? 'warn' : ''}`}>{u.role === 'ADMIN' ? 'Admin' : 'Usuário'}</span>
                      <span className={`pill ${u.active ? 'ok' : 'bad'}`}>{u.active ? 'Ativo' : 'Desativado'}</span>
                      <span className={`pill ${u.twoFactorEnabled ? 'accent' : 'warn'}`}>
                        {u.twoFactorEnabled ? '2FA' : u.mustChangePassword ? '1º acesso' : 'Sem 2FA'}
                      </span>
                    </span>
                    <span className="admin-chevron" aria-hidden="true">›</span>
                  </button>

                  {open && (
                    <div className="admin-user-detail">
                      <dl>
                        <div>
                          <dt>ID da conta</dt>
                          <dd>
                            <code title={u.id}>{u.id}</code>
                            <button className="admin-copy" onClick={() => void copy(`id-${u.id}`, u.id)} aria-label="Copiar ID">
                              <IconCopy size={14} /> {copied === `id-${u.id}` ? 'Copiado' : 'Copiar'}
                            </button>
                          </dd>
                        </div>
                        <div>
                          <dt>Código de contato (15h)</dt>
                          <dd>
                            {u.contactCode ? (
                              <>
                                <code>{u.contactCode}</code>
                                <small className="muted">até {fmtDateTime(u.contactCodeUntil!)}</small>
                              </>
                            ) : <span className="muted">nenhum código ativo</span>}
                          </dd>
                        </div>
                        <div><dt>Conta criada</dt><dd>{fmtDateTime(u.createdAt)}</dd></div>
                        <div><dt>Último login</dt><dd>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'nunca entrou'}</dd></div>
                      </dl>
                      <div className="admin-user-actions">
                        <button className="ghost" onClick={() => reset(u)} disabled={isMe} title={isMe ? 'Você não pode resetar a própria conta aqui' : undefined}>
                          <IconKey size={15} /> Resetar senha e 2FA
                        </button>
                        <button className={u.active ? 'ghost danger-ghost' : ''} onClick={() => toggle(u)} disabled={isMe} title={isMe ? 'Você não pode desativar a própria conta' : undefined}>
                          <IconLock size={15} /> {u.active ? 'Desativar login' : 'Reativar login'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="admin-side">
        <section className="admin-panel admin-create">
          <header>
            <span className="admin-create-icon"><IconUserPlus size={20} /></span>
            <div>
              <h2>Novo usuário</h2>
              <p>O acesso é fechado: só quem você cria consegue entrar.</p>
            </div>
          </header>
          <form onSubmit={create}>
            <label>
              Nome de usuário
              <input
                placeholder="ex.: maria.silva"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                autoComplete="off"
                spellCheck={false}
                required
              />
              <small className={username && !validName ? 'admin-hint bad' : 'admin-hint'}>
                3 a 32 caracteres: letras minúsculas, números, _ . -
              </small>
            </label>
            <div className="admin-role" role="radiogroup" aria-label="Cargo">
              {(['USER', 'ADMIN'] as Role[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  role="radio"
                  aria-checked={role === r}
                  className={role === r ? 'active' : ''}
                  onClick={() => setRole(r)}
                >
                  <b>{r === 'USER' ? 'Usuário' : 'Administrador'}</b>
                  <small>{r === 'USER' ? 'Acesso às ferramentas' : 'Gerencia contas e logs'}</small>
                </button>
              ))}
            </div>
            <button type="submit" disabled={!validName || creating}>
              <IconPlus size={16} /> {creating ? 'Criando…' : 'Criar usuário'}
            </button>
          </form>
        </section>

        {temp && (
          <section className="admin-panel admin-credentials" role="status">
            <header>
              <IconKey size={18} />
              <b>{temp.reset ? 'Acesso resetado' : 'Conta criada'}</b>
              <button className="track-remove" onClick={() => setTemp(null)} aria-label="Fechar">×</button>
            </header>
            <div className="admin-cred-row"><span>Usuário</span><code>{temp.username}</code></div>
            <div className="admin-cred-row"><span>Senha temporária</span><code>{temp.password}</code></div>
            <p>Copie agora — a senha não será exibida novamente. No 1º login a pessoa troca a senha e ativa o 2FA.</p>
            <button onClick={() => void copy('cred', `Usuário: ${temp.username}\nSenha: ${temp.password}`)}>
              <IconCopy size={16} /> {copied === 'cred' ? 'Copiado!' : 'Copiar dados de acesso'}
            </button>
          </section>
        )}
      </aside>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

/* ---------------------------------- logs --------------------------------- */

type Tone = 'ok' | 'bad' | 'warn' | 'accent' | '';

/** Rótulo e tom de cada ação conhecida; o resto cai no nome técnico. */
const ACTIONS: Record<string, [string, Tone]> = {
  LOGIN_SUCCESS: ['Login realizado', 'ok'],
  LOGIN_FAILED_BAD_PASSWORD: ['Senha incorreta', 'bad'],
  LOGIN_FAILED_UNKNOWN_USER: ['Usuário inexistente', 'bad'],
  LOGIN_BLOCKED_INACTIVE: ['Login de conta desativada', 'bad'],
  ACCOUNT_LOCKED: ['Conta bloqueada', 'bad'],
  LOGOUT: ['Saiu da conta', ''],
  PASSWORD_CHANGED: ['Senha alterada', 'warn'],
  ADMIN_USER_CREATED: ['Usuário criado', 'accent'],
  ADMIN_USER_RESET: ['Acesso resetado', 'warn'],
  ADMIN_USER_BLOCKED: ['Login desativado', 'warn'],
  ADMIN_USER_UNBLOCKED: ['Login reativado', 'accent'],
  DISPLAY_NAME_CHANGED: ['Nome de exibição alterado', ''],
  AVATAR_UPDATED: ['Foto atualizada', ''],
  AVATAR_REMOVED: ['Foto removida', ''],
  PRIVACY_SETTINGS_UPDATED: ['Privacidade alterada', ''],
  DISCORD_LINK_CODE: ['Código do Discord gerado', ''],
  DISCORD_UNLINKED: ['Discord desvinculado', ''],
  OSINT_DOMAIN_SCAN: ['OSINT: domínio/IP', 'accent'],
  OSINT_USERNAME_SCAN: ['OSINT: username', 'accent'],
  CHAT_DM_OPENED: ['Conversa aberta', ''],
  CHAT_GROUP_CREATED: ['Grupo criado', ''],
  FRIEND_REQUEST_SENT: ['Pedido de amizade enviado', ''],
  FRIEND_REQUEST_ACCEPTED: ['Pedido de amizade aceito', ''],
  FRIEND_REQUEST_REJECTED: ['Pedido de amizade recusado', ''],
  AGENDA_CREATED: ['Compromisso criado', ''],
  AGENDA_UPDATED: ['Compromisso alterado', ''],
  AGENDA_DELETED: ['Compromisso excluído', ''],
  SANO_COMMAND: ['Comando ao Sano', ''],
  TRAINER_ONBOARDED: ['Treino configurado', ''],
  TRAINER_WORKOUT_LOGGED: ['Treino registrado', ''],
  TRAINER_BODY_ASSESSMENT: ['Avaliação corporal', ''],
  TRAINER_ASKED_AI: ['Pergunta à IA do treino', ''],
};

const describe = (action: string): [string, Tone] =>
  ACTIONS[action] ?? [action.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), /FAIL|LOCK|BLOCK/.test(action) ? 'bad' : ''];

/** Navegador e sistema a partir do user-agent, sem biblioteca. */
const device = (ua?: string | null) => {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /bot|discord/i.test(ua) ? 'Bot' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return [browser, os].filter(Boolean).join(' · ') || null;
};

const LOG_FILTERS: [string, string][] = [
  ['', 'Todas as ações'],
  ['LOGIN_SUCCESS', 'Logins'],
  ['LOGIN_FAILED_BAD_PASSWORD', 'Senha incorreta'],
  ['LOGIN_FAILED_UNKNOWN_USER', 'Usuário inexistente'],
  ['LOGIN_BLOCKED_INACTIVE', 'Conta desativada'],
  ['ACCOUNT_LOCKED', 'Conta bloqueada'],
  ['PASSWORD_CHANGED', 'Senha alterada'],
  ['ADMIN_USER_CREATED', 'Usuário criado'],
  ['ADMIN_USER_RESET', 'Acesso resetado'],
  ['ADMIN_USER_BLOCKED', 'Login desativado'],
  ['OSINT_DOMAIN_SCAN', 'OSINT: domínio/IP'],
  ['OSINT_USERNAME_SCAN', 'OSINT: username'],
];

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoje';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

function LogsTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [data, setData] = useState<{ total: number; limit: number; logs: AuditLog[] } | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    const qs = new URLSearchParams({ page: String(page), limit: '30' });
    if (action) qs.set('action', action);
    api.get<{ total: number; limit: number; logs: AuditLog[] }>(`/admin/logs?${qs}`)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [page, action, tick]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <section className="admin-panel admin-logs">
      <div className="admin-toolbar">
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filtrar por ação">
          {LOG_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <span className="muted admin-log-total">{data ? `${data.total} registro(s)` : 'Carregando…'}</span>
        <button className="ghost" onClick={() => setTick((t) => t + 1)}>Atualizar</button>
      </div>

      {error && <div className="error">{error}</div>}

      {!data && (
        <div className="admin-log-list">
          {[0, 1, 2, 3, 4].map((n) => <span key={n} className="skeleton" style={{ height: 46, margin: '6px 0' }} />)}
        </div>
      )}

      {data && data.logs.length === 0 && (
        <div className="admin-empty">
          <IconShield size={24} />
          <b>Nenhum registro</b>
          <span>Nada foi registrado com esse filtro.</span>
        </div>
      )}

      {data && data.logs.length > 0 && (
        <ol className="admin-log-list stagger" key={`${page}-${action}-${tick}`}>
          {data.logs.map((l, i) => {
            const [label, tone] = describe(l.action);
            const prev = data.logs[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(l.createdAt).toDateString();
            const dev = device(l.userAgent);
            return (
              <li key={l.id} style={{ '--i': i } as React.CSSProperties}>
                {newDay && <span className="admin-log-day">{dayLabel(l.createdAt)}</span>}
                <div className={`admin-log tone-${tone || 'neutral'}`}>
                  <span className="admin-log-dot" aria-hidden="true" />
                  <div className="admin-log-main">
                    <b>{label}</b>
                    <small>
                      {l.user ? `@${l.user.username}` : 'sem usuário'}
                      {l.ip && <> · <span className="admin-log-ip">{l.ip}</span></>}
                      {dev && <> · {dev}</>}
                    </small>
                  </div>
                  <time dateTime={l.createdAt} title={fmtDateTime(l.createdAt)}>
                    {new Date(l.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="pager">
        <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">‹ Anterior</button>
        <span className="muted">{page} / {pages}</span>
        <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página">Próxima ›</button>
      </div>
    </section>
  );
}
