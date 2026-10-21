import type { ReactNode } from 'react';
import type { AccountType } from '../../types/finance';

/** Ícones do módulo de finanças — mesmo traço dos ícones de `ui/icons`. */
const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

type P = { size?: number };

export const IconBank = ({ size = 18 }: P) => svg(size, <><path d="M3 10h18L12 4 3 10z" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>);
export const IconCard = ({ size = 18 }: P) => svg(size, <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></>);
export const IconCash = ({ size = 18 }: P) => svg(size, <><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></>);
export const IconPiggy = ({ size = 18 }: P) => svg(size, <><path d="M5 11a6 5 0 0 1 11-2.5h2.5L20 10v4h-2l-1.5 3H14v-1.5h-4V17H7.5L6.5 14A5 5 0 0 1 5 11z" /><path d="M15 11h.01M3 10.5c.5 1 1.2 1.5 2 1.5" /></>);
export const IconTrend = ({ size = 18 }: P) => svg(size, <><path d="M3 17l6-6 4 4 7-8" /><path d="M15 7h5v5" /></>);
export const IconWalletSmall = ({ size = 18 }: P) => svg(size, <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="3.5" y="7.5" width="17" height="11.5" rx="2.5" /><path d="M16 13.2h.01" /></>);
export const IconRepeat = ({ size = 18 }: P) => svg(size, <><path d="M17 2.5l3 3-3 3" /><path d="M4 11V9.5a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3" /><path d="M20 13v1.5a4 4 0 0 1-4 4H4" /></>);
export const IconEdit = ({ size = 16 }: P) => svg(size, <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M14 7l3 3" /></>);
export const IconTrash = ({ size = 16 }: P) => svg(size, <><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></>);
export const IconUpload = ({ size = 16 }: P) => svg(size, <><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>);
export const IconPlus = ({ size = 16 }: P) => svg(size, <path d="M12 5v14M5 12h14" />);
export const IconLeft = ({ size = 18 }: P) => svg(size, <path d="M15 6l-6 6 6 6" />);
export const IconRight = ({ size = 18 }: P) => svg(size, <path d="M9 6l6 6-6 6" />);
export const IconDown = ({ size = 16 }: P) => svg(size, <path d="M6 9l6 6 6-6" />);
export const IconCheck = ({ size = 14 }: P) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconMore = ({ size = 16 }: P) => svg(size, <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>);
export const IconBudget = ({ size = 18 }: P) => svg(size, <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M3.5 9h17M9 9v11" /></>);
export const IconList = ({ size = 18 }: P) => svg(size, <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />);
export const IconChart = ({ size = 18 }: P) => svg(size, <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />);

export function AccountIcon({ type, size = 16 }: { type: AccountType; size?: number }) {
  switch (type) {
    case 'CREDIT': return <IconCard size={size} />;
    case 'CASH': return <IconCash size={size} />;
    case 'SAVINGS': return <IconPiggy size={size} />;
    case 'INVESTMENT': return <IconTrend size={size} />;
    case 'CHECKING': return <IconBank size={size} />;
    default: return <IconWalletSmall size={size} />;
  }
}
