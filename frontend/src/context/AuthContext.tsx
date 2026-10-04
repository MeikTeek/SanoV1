import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../services/api';
import type { User } from '../types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  /** Aceita `null` (logout) ou umpatch parcial para atualizar foto/nome. */
  setUser: (u: User | null | ((prev: User | null) => User | null)) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Aceita valor direto ou função de atualização (patch parcial de foto/nome).
  const setUser = (u: User | null | ((prev: User | null) => User | null)) =>
    setUserState((prev) => (typeof u === 'function' ? u(prev) : u));

  useEffect(() => {
    api.get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, setUser, logout }}>{children}</Ctx.Provider>;
}
