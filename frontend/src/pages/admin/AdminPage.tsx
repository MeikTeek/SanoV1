import { useCallback, useEffect, useState, type FormEvent } from 'react';
import AppShell from '../../components/layout/AppShell';
import { api } from '../../services/api';
import type { AdminUser, AuditLog, Role } from '../../types';

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'logs'>('users');
  return (
    <AppShell title="Administração" status="área restrita" workspace>
      <div className="tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Usuários</button>
        <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>Logs de segurança</button>
      </div>
      {tab === 'users' ? <UsersTab /> : <LogsTab />}
    </AppShell>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get<{ users: AdminUser[] }>('/admin/users').then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const guard = async (fn: () => Promise<void>) => {
    setError('');
    try { await fn(); load(); } catch (e) { setError((e as Error).message); }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    guard(async () => {
      const r = await api.post<{ user: AdminUser; tempPassword: string }>('/admin/users', { username, role });
      setTemp({ username: r.user.username, password: r.tempPassword });
      setUsername('');
    });
  };

  const toggle = (u: AdminUser) => guard(async () => { await api.patch(`/admin/users/${u.id}/active`, { active: !u.active }); });
  const reset = (u: AdminUser) => {
    if (!confirm(`Resetar senha e 2FA de "${u.username}"?`)) return;
    guard(async () => {
      const r = await api.post<{ tempPassword: string }>(`/admin/users/${u.id}/reset`);
      setTemp({ username: u.username, password: r.tempPassword });
    });
  };

  return (
    <section className="card">
      <form className="inline" onSubmit={create}>
        <input placeholder="novo usuário" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button>Criar usuário</button>
      </form>

      {temp && (
        <div className="notice">
          Senha temporária de <b>{temp.username}</b>: <code>{temp.password}</code><br />
          <small>Copie agora — ela não será exibida novamente.</small>
          <button className="ghost" onClick={() => setTemp(null)}>Fechar</button>
        </div>
      )}
      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Usuário</th><th>Cargo</th><th>Status</th><th>2FA</th><th>Último login</th><th>Ações</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td className={u.active ? 'ok' : 'bad'}>{u.active ? 'Ativo' : 'Bloqueado'}</td>
                <td>{u.twoFactorEnabled ? '✔' : u.mustChangePassword ? 'Aguardando 1º acesso' : 'Pendente'}</td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('pt-BR') : '—'}</td>
                <td className="actions">
                  <button className="ghost" onClick={() => toggle(u)}>{u.active ? 'Bloquear' : 'Desbloquear'}</button>
                  <button className="ghost" onClick={() => reset(u)}>Resetar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LogsTab() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; limit: number; logs: AuditLog[] }>({ total: 0, limit: 25, logs: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<typeof data>(`/admin/logs?page=${page}&limit=25`).then(setData).catch((e) => setError(e.message));
  }, [page]);

  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  return (
    <section className="card">
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>IP</th></tr></thead>
          <tbody>
            {data.logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString('pt-BR')}</td>
                <td>{l.user?.username ?? '—'}</td>
                <td className={/FAIL|LOCK|BLOCK/.test(l.action) ? 'bad' : ''}>{l.action}</td>
                <td>{l.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
        <span className="muted">{page} / {pages}</span>
        <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
      </div>
    </section>
  );
}
