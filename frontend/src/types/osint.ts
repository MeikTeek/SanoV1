export interface OsintCheckInfo {
  id: string;
  label: string;
  description: string;
}

export interface OsintCatalog {
  checks: OsintCheckInfo[];
  emailChecks: OsintCheckInfo[];
  username: {
    total: number;
    totalWithNsfw: number;
    sources: { wmn: number; sherlock: number };
    categories: { id: string; count: number }[];
    credits: string;
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

export type EmailStreamLine =
  | { type: 'start'; email: string; avatar: string; suggestions: string[] }
  | { type: 'check'; id: string; result: OsintCheckResult }
  | { type: 'done' };

export type UsernameStatus = 'found' | 'missing' | 'unknown' | 'error';
export type Confidence = 'high' | 'medium' | 'low';

export interface UsernameHit {
  username: string;
  site: string;
  category: string;
  url: string;
  status: UsernameStatus;
  confidence: Confidence;
  source: 'wmn' | 'sherlock';
  http?: number;
  detail?: string;
  profile?: { title?: string; description?: string; image?: string };
}

export type UsernameStreamLine =
  | { type: 'start'; usernames: string[]; total: number; sites: number }
  | ({ type: 'result' } & UsernameHit)
  | ({ type: 'done'; ms: number } & Record<UsernameStatus, number>);
