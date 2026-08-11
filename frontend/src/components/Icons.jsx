const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const IconOverview = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconManage = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);

export const IconRevenue = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);

export const IconReport = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M4 19h16M8 19v-6M13 19V9M18 19V5" />
  </svg>
);

export const IconAssistant = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="4" y="6" width="16" height="11" rx="2.5" />
    <path d="M9 11h.01M15 11h.01M9 14.5c1 .8 5 .8 6 0" />
    <path d="M12 3v3" />
  </svg>
);

export const IconSettings = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z" />
  </svg>
);

export const IconEdit = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
  </svg>
);

export const IconTrash = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" />
  </svg>
);

export const IconClock = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
  </svg>
);

export const IconPlus = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconChevron = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconRefresh = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M21 12a9 9 0 10-3 6.7" /><path d="M21 4v6h-6" />
  </svg>
);

export const IconSend = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" />
  </svg>
);

export const IconBot = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="4" y="8" width="16" height="10" rx="2.5" />
    <path d="M12 2v4M9 13h.01M15 13h.01M8 18v2M16 18v2" />
  </svg>
);

export const IconFilter = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M4 5h16M7 12h10M10 19h4" />
  </svg>
);

export const IconCheck = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconSearch = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);

export const IconLock = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);

export const IconCurrency = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="12" cy="12" r="9" /><path d="M9 8h4a2 2 0 010 4H9m0 0h4a2 2 0 010 4H9M11 6v2m0 8v2" />
  </svg>
);

export const IconCalendar = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </svg>
);

export const IconTarget = (p) => (
  <svg viewBox="0 0 24 24" {...base} {...p}>
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
  </svg>
);
