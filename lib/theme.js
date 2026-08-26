// Wspólne tokeny wizualne dla całej aplikacji ("PLVACC Red" — jasny motyw
// zgodny z identyfikacją plvacc.pl (czerwień/biel) i układem inspirowanym
// CoreVACC (sidebar, karty, tabele). Trzymane w jednym miejscu, żeby każda
// strona wyglądała spójnie bez duplikowania tych samych kolorów wszędzie.
//
// Uwaga: nazwa tokenu `amber` została zachowana ze starego, ciemnego motywu
// (żeby nie trzeba było zmieniać każdej strony), ale jego wartość to teraz
// czerwień marki PLVACC — to główny kolor akcentu w całej aplikacji.
// Osobny token `gold` przejął dawne znaczenie „bursztynu" tam, gdzie chodziło
// o kolorowanie wg typu (pozycja APP, plakietki CE), żeby nie zlewało się
// z czerwienią marki.

export const colors = {
  bg: '#f2f3f5',
  card: '#ffffff',
  cardAlt: '#f8f8fa',
  border: '#e3e5ea',
  borderLight: '#edeef1',
  text: '#20232b',
  muted: '#6b7280',
  mutedDim: '#98a0ab',

  // Czerwień marki PLVACC — główny akcent (przyciski, aktywne linki, sidebar).
  amber: '#c8102e',
  amberBg: 'rgba(200, 16, 46, 0.08)',

  gold: '#b7791f',
  goldBg: 'rgba(183, 121, 31, 0.12)',

  blue: '#2563eb',
  blueBg: 'rgba(37, 99, 235, 0.08)',
  red: '#dc2626',
  redBg: 'rgba(220, 38, 38, 0.08)',
  green: '#16a34a',
  greenBg: 'rgba(22, 163, 74, 0.08)',
  purple: '#7c3aed',
  purpleBg: 'rgba(124, 58, 237, 0.08)',
  cyan: '#0891b2',
  cyanBg: 'rgba(8, 145, 178, 0.08)',
};

// Gradient użyty w górnym pasku i innych miejscach nawiązujących do
// czerwonego hero plvacc.pl.
export const brandGradient = 'linear-gradient(135deg, #7a0f1e 0%, #c8102e 55%, #e0223f 100%)';

// Kolory wg typu pozycji ATC — jak w oryginalnej aplikacji (CTR=czerwony,
// APP=złoty, TWR=niebieski, GND=zielony, DEL=fioletowy).
export const positionTypeColor = {
  CTR: colors.red,
  APP: colors.gold,
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
    color: colors.text,
  },
  sub: { color: colors.muted, margin: '0 0 20px' },
  card: {
    padding: '14px 16px',
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
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
    background: colors.amber,
    color: '#ffffff',
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
    background: 'rgba(20, 12, 14, 0.55)',
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
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: 28,
    boxShadow: '0 20px 40px rgba(16, 24, 40, 0.18)',
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
    badges.push({ label: 'S3-CE', color: warn ? colors.red : colors.gold, bg: warn ? colors.redBg : colors.goldBg });
  } else if (has('S2-CE')) {
    const warn = c.rating === 'S3';
    badges.push({ label: 'S2-CE', color: warn ? colors.red : colors.gold, bg: warn ? colors.redBg : colors.goldBg });
  }
  if (has('C1-CE')) badges.push({ label: 'C1-CE', color: colors.gold, bg: colors.goldBg });
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
