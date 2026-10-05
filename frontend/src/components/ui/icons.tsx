import type { ReactNode } from 'react';

/** Ícones em SVG inline (stroke) — sem dependência externa. */
type P = { size?: number };

const svg = (size: number, children: ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconChat = ({ size = 22 }: P) =>
  svg(size, <><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" /></>);

export const IconCalendar = ({ size = 22 }: P) =>
  svg(size, <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>);

export const IconDumbbell = ({ size = 22 }: P) =>
  svg(size, <><path d="M4 9v6M20 9v6M8 7v10M16 7v10M2 11v2M22 11v2M8 12h8" /></>);

export const IconShield = ({ size = 22 }: P) =>
  svg(size, <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" /><path d="M9.5 12l1.8 1.8L15 10" /></>);

export const IconBell = ({ size = 20 }: P) =>
  svg(size, <><path d="M18 15V10a6 6 0 1 0-12 0v5l-2 3h16l-2-3z" /><path d="M10 21h4" /></>);

export const IconSend = ({ size = 20 }: P) =>
  svg(size, <><path d="M4 12l16-8-5 16-3.5-6L4 12z" /></>);

export const IconSettings = ({ size = 18 }: P) =>
  svg(size, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3h.1A1.7 1.7 0 0 0 10 1.6V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 3a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.6 1h.4a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" /></>);

export const IconLogout = ({ size = 18 }: P) =>
  svg(size, <><path d="M14 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8" /><path d="M17 8l4 4-4 4M21 12h-9" /></>);

/* ------------------------- Módulo 1: bate-papo ------------------------- */

export const IconBubble = ({ size = 22 }: P) =>
  svg(size, <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-2.9-.4L4 21l1.6-4.1A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" /></>);

export const IconUsers = ({ size = 22 }: P) =>
  svg(size, <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.4M17.5 20c0-2.4-.9-4-2.5-4.6" /></>);

export const IconPlus = ({ size = 20 }: P) =>
  svg(size, <><path d="M12 5v14M5 12h14" /></>);

export const IconUserPlus = ({ size = 18 }: P) =>
  svg(size, <><circle cx="10" cy="8" r="3.2" /><path d="M4 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M19 8v6M16 11h6" /></>);

export const IconHash = ({ size = 18 }: P) =>
  svg(size, <><path d="M9 3L7 21M17 3l-2 18M4 9h16M3 15h16" /></>);

export const IconImage = ({ size = 20 }: P) =>
  svg(size, <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M4 17l4.5-4.5 3.5 3.5 3-3L20 17" /></>);

export const IconMic = ({ size = 20 }: P) =>
  svg(size, <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>);

export const IconStop = ({ size = 20 }: P) =>
  svg(size, <><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></>);

export const IconPlay = ({ size = 16 }: P) =>
  svg(size, <><path d="M7 4l12 8-12 8V4z" fill="currentColor" /></>);

export const IconPause = ({ size = 16 }: P) =>
  svg(size, <><path d="M8 4v16M16 4v16" strokeWidth="2.4" /></>);

export const IconBack = ({ size = 20 }: P) =>
  svg(size, <><path d="M15 5l-7 7 7 7" /></>);

export const IconSearch = ({ size = 18 }: P) =>
  svg(size, <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>);

export const IconCopy = ({ size = 16 }: P) =>
  svg(size, <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" /></>);

export const IconKey = ({ size = 18 }: P) =>
  svg(size, <><circle cx="8" cy="14" r="4" /><path d="M11 11l8-8 2 2-1.5 1.5L21 8l-2 2-1.5-1.5L15 10" /></>);

export const IconLock = ({ size = 18 }: P) =>
  svg(size, <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" /></>);

export const IconPhone = ({ size = 18 }: P) =>
  svg(size, <><path d="M5 4h3.5l1.7 4.2-2.2 1.6a12 12 0 0 0 6.2 6.2l1.6-2.2L20 15.5V19a1.8 1.8 0 0 1-2 1.8A15.8 15.8 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4z" /></>);

export const IconInfo = ({ size = 18 }: P) =>
  svg(size, <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.4" /></>);

export const IconSmile = ({ size = 20 }: P) =>
  svg(size, <><circle cx="12" cy="12" r="8.5" /><path d="M8.8 14.2a4 4 0 0 0 6.4 0M9.2 9.8v.4M14.8 9.8v.4" /></>);

export const IconChevron = ({ size = 16 }: P) =>
  svg(size, <><path d="M6 9.5l6 6 6-6" /></>);

/** Marcador de não lida: bolinha ciano cheia, sem número. */
export const IconUnread = ({ size = 10 }: P) =>
  svg(size, <><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /></>);