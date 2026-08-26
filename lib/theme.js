// Wspólne tokeny wizualne dla całej aplikacji ("Night Vector" — ciemny motyw
// lotniczy z akcentem bursztynowym). Trzymane w jednym miejscu, żeby każda
// strona wyglądała spójnie bez duplikowania tych samych kolorów wszędzie.

export const colors = {
  bg: '#0b1220',
  card: '#121b2e',
  cardAlt: '#0e1626',
  border: '#1b2436',
  borderLight: '#151d2e',
  text: '#e8edf7',
  muted: '#94a3b8',
  mutedDim: '#64748b',
  amber: '#f5a623',
  amberBg: 'rgba(245, 166, 35, 0.12)',
  blue: '#60a5fa',
  blueBg: 'rgba(96, 165, 250, 0.12)',
  red: '#f87171',
  redBg: 'rgba(248, 113, 113, 0.12)',
  green: '#34d399',
  greenBg: 'rgba(52, 211, 153, 0.12)',
  purple: '#a78bfa',
  purpleBg: 'rgba(167, 139, 250, 0.12)',
  cyan: '#22d3ee',
  cyanBg: 'rgba(34, 211, 238, 0.12)',
};

// Kolory wg typu pozycji ATC — jak w oryginalnej aplikacji (CTR=czerwony,
// APP=bursztynowy, TWR=niebieski, GND=zielony, DEL=fioletowy).
export const positionTypeColor = {
  CTR: colors.red,
  APP: colors.amber,
  TWR: colors.blue,
  GND: colors.green,
  DEL: colors.purple,
};

// Kolory wg rodzaju wpisu w Events (event=czerwony, exam=fioletowy,
// announcement=cyjan).
export const eventKindMeta = {
  event: { label: 'EVENT', color: colors.red, bg: colors.redBg },
  exam: { label: 'EXAM', color: colors.purple, bg: colors.purpleBg },
  announcement: { label: 'ANNOUNCEMENT', color: colors.cyan, bg: colors.cyanBg },
};

export const eventStatusMeta = {
  draft: { label: 'DRAFT', color: colors.muted },
  published: { label: 'PUBLISHED', color: colors.green },
  completed: { label: 'COMPLETED', color: colors.mutedDim },
};

export const font = {
  mono: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

export const shared = {
  page: {
    minHeight: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
  },
  h1: {
    fontSize: '1.8rem',
    margin: '0 0 4px',
    letterSpacing: '0.02em',
    fontFamily: font.mono,
  },
  sub: { color: colors.muted, margin: '0 0 20px' },
  card: {
    padding: '14px 16px',
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.card,
  },
  input: {
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    color: colors.text,
    fontSize: '0.9rem',
    outline: 'none',
  },
  btnPrimary: {
    padding: '10px 16px',
    borderRadius: 8,
    border: `1px solid ${colors.amber}`,
    background: colors.amberBg,
    color: colors.amber,
    fontWeight: 700,
    fontSize: '0.8rem',
    letterSpacing: '0.03em',
    cursor: 'pointer',
  },
  btnGhost: {
    padding: '10px 16px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontWeight: 600,
    fontSize: '0.8rem',
    letterSpacing: '0.03em',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '8px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.red}`,
    background: colors.redBg,
    color: colors.red,
    fontWeight: 700,
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  badge: (color, bg) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 6,
    background: bg,
    color,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
  }),
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(4, 8, 16, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 100,
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88vh',
    overflowY: 'auto',
    background: colors.cardAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: 28,
  },
};

export const RATING_RANK = {
  SUS: 0, OBS: 1, S1: 2, S2: 3, S3: 4, C1: 5, C2: 6, C3: 7, I1: 8, I2: 9, I3: 10, SUP: 11, ADM: 12,
};

// PE/CE/S2-CE/S3-CE/C1-CE badges derived from controllers.endorsements (text[]).
// Rules: only show what's actually held; S2-CE is hidden when S3-CE is present
// (implied); S2-CE glows red on an S3-rated controller (should have S3-CE);
// S3-CE glows red on a C1-rated controller who lacks C1-CE (should upgrade);
// C1-CE and PE never glow red.
export function endorsementBadges(c) {
  const e = c?.endorsements || [];
  const has = (x) => e.includes(x);
  const badges = [];
  if (has('PE')) badges.push({ label: 'PE', color: colors.purple, bg: colors.purpleBg });
  if (has('S3-CE')) {
    const warn = c.rating === 'C1' && !has('C1-CE');
    badges.push({ label: 'S3-CE', color: warn ? colors.red : colors.amber, bg: warn ? colors.redBg : colors.amberBg });
  } else if (has('S2-CE')) {
    const warn = c.rating === 'S3';
    badges.push({ label: 'S2-CE', color: warn ? colors.red : colors.amber, bg: warn ? colors.redBg : colors.amberBg });
  }
  if (has('C1-CE')) badges.push({ label: 'C1-CE', color: colors.amber, bg: colors.amberBg });
  return badges;
}

export function formatDatePl(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatTimeZ(t) {
  if (!t) return null;
  return t.slice(0, 5) + 'z';
}
