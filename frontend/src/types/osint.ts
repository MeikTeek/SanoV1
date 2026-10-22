export interface OsintCheckInfo {
  id: string;
  label: string;
  description: string;
}

export interface OsintCatalog {
  checks: OsintCheckInfo[];
  username: {
    total: number;
    categories: { id: string; count: number }[];
    source: string;
  };
}

export interface OsintTarget {
  url: string;
  hostname: string;
  isIp: boolean;
  domain: string;
}

/** Resultado de uma verificação: dados livres, ou um dos envelopes de pulo/erro. */
export type OsintCheckResult = Record<string, unknown> & { skipped?: string; error?: string };

export type DomainStreamLine =
  | { type: 'start'; target: OsintTarget }
  | { type: 'check'; id: string; result: OsintCheckResult }
  | { type: 'done' };

export type UsernameStatus = 'found' | 'missing' | 'unknown' | 'error';

export interface UsernameHit {
  site: string;
  category: string;
  url: string;
  status: UsernameStatus;
  http?: number;
  detail?: string;
}

export type UsernameStreamLine =
  | { type: 'start'; username: string; total: number }
  | ({ type: 'result' } & UsernameHit)
  | ({ type: 'done' } & Record<UsernameStatus, number>);
