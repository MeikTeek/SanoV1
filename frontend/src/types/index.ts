export type Role = 'ADMIN' | 'USER';
export type AuthStep = 'CHANGE_PASSWORD' | 'SETUP_2FA' | 'VERIFY_2FA';

export interface User {
  id: string;
  username: string;
  /** Nome de exibição editável (trocável a cada 2 meses). Cai para o username. */
  displayName: string | null;
  /** Avatar em data URL; null quando o usuário não subiu foto. */
  avatarDataUrl: string | null;
  role: Role;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
}

export interface AdminUser extends User {
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  contactCode: string | null;
  contactCodeUntil: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  ip: string | null;
  createdAt: string;
  user: { username: string } | null;
}
