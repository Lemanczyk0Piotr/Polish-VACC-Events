// Wspólne tokeny wizualne dla całej aplikacji ("PLVACC Red" — motyw
// zgodny z identyfikacją plvacc.pl (czerwień/biel) i układem inspirowanym
// CoreVACC (sidebar, karty, tabele). Trzymane w jednym miejscu, żeby każda
// strona wyglądała spójnie bez duplikowania tych samych kolorów wszędzie.
//
// Każdy token wskazuje na zmienną CSS (zdefiniowaną w pages/_document.js
// dla :root i [data-theme="dark"]), a nie na literalny hex — dzięki temu
// przełącznik jasny/ciemny (components/Layout.js) przekolorowuje całą
// aplikację ustawiając atrybut data-theme na <html>, bez potrzeby
// przeliczania czegokolwiek w Reakcie.
//
// Uwaga: nazwa tokenu `amber` została zachowana ze starego, ciemnego motywu
// (żeby nie trzeba było zmieniać każdej strony), ale jego wartość to teraz
// czerwień marki PLVACC — to główny kolor akcentu w całej aplikacji.
// Osobny token `gold` przejął dawne znaczenie „bursztynu" tam, gdzie chodziło
// o kolorowanie wg typu (pozycja APP, plakietki CE), żeby nie zlewało się
// z czerwienią marki.

export const colors = {
  bg: 'var(--pv-bg)',
  card: 'var(--pv-card)',
  cardAlt: 'var(--pv-card-alt)',
  border: 'var(--pv-border)',
  borderLight: 'var(--pv-border-light)',
  text: 'var(--pv-text)',
  muted: 'var(--pv-muted)',
  mutedDim: 'var(--pv-muted-dim)',

  // Czerwień marki PLVACC — główny akcent (przyciski, aktywne linki, sidebar).
  amber: 'var(--pv-amber)',
  amberBg: 'var(--pv-amber-bg)',

  gold: 'var(--pv-gold)',
  goldBg: 'var(--pv-gold-bg)',

  blue: 'var(--pv-blue)',
  blueBg: 'var(--pv-blue-bg)',
  red: 'var(--pv-red)',
  redBg: 'var(--pv-red-bg)',
  green: 'var(--pv-green)',
  greenBg: 'var(--pv-green-bg)',
  purple: 'var(--pv-purple)',
  purpleBg: 'var(--pv-purple-bg)',
  cyan: 'var(--pv-cyan)',
  cyanBg: 'var(--pv-cyan-bg)',
};

// Gradient użyty w górnym pasku i innych miejscach nawiązujących do
// czerwonego hero plvacc.pl. Też zmienna CSS — w ciemnym motywie jest
// odrobinę głębszy/ciemniejszy.
export const brandGradient = 'var(--pv-brand-gradient)';

// Kolory wg typu pozycji ATC — jak w oryginalnej aplikacji (CTR=czerwony,
// APP=złoty, TWR=niebieski, GND=zielony, DEL=fioletowy).
export const positionTypeColor = {
  CTR: colors.red,
  APP: colors.gold,
  TWR: colors.blue,
  GND: colors.green,
  DEL: colors.purple,
};

// Tła belek na harmonogramie Gantta (components/ScheduleGrid.js) — stałe,
// nieprzezroczyste w ~90% wypełnienia koloru danego typu pozycji. Osobne
// zmienne CSS (a nie np. hexToRgba(positionTypeColor[type], 0.9) w locie),
// bo positionTypeColor jest teraz zmienną CSS (var(...)), której nie da się
// sparsować jako hex w JS-ie.
export const positionTypeBarBg = {
  CTR: 'var(--pv-bar-ctr)',
  APP: 'var(--pv-bar-app)',
  TWR: 'var(--pv-bar-twr)',
  GND: 'var(--pv-bar-gnd)',
  DEL: 'var(--pv-bar-del)',
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
  // Tekst i treść — pismo o ludzkim, "zwykłym" charakterze zamiast systemowego stosu.
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  // Nagłówki i marka — odróżnia się od domyślnych fontów systemowych/"AI-generated" look.
  display: "'Sora', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export const shared = {
  page: {
    minHeight: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
  },
  h1: {
    fontSize: '1.9rem',
    margin: '0 0 4px',
    letterSpacing: '-0.01em',
    fontWeight: 700,
    fontFamily: font.display,
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
    padding: '11px 18px',
    borderRadius: 8,
    border: `1px solid ${colors.amber}`,
    background: colors.amber,
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '0.9rem',
    letterSpacing: '0.02em',
    cursor: 'pointer',
  },
  btnGhost: {
    padding: '11px 18px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontWeight: 600,
    fontSize: '0.9rem',
    letterSpacing: '0.02em',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '9px 16px',
    borderRadius: 8,
    border: `1px solid ${colors.red}`,
    background: colors.redBg,
    color: colors.red,
    fontWeight: 700,
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  badge: (color, bg) => ({
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 6,
    background: bg,
    color,
    fontSize: '0.8rem',
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

// lang-aware: 'pl' -> pl-PL locale, anything else (e.g. 'en') -> en-GB.
// formatDatePl is kept as a thin wrapper (defaults to Polish) so any call
// site that hasn't been updated to pass a lang still works exactly as before.
export function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00Z');
  const locale = lang === 'en' ? 'en-GB' : 'pl-PL';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDatePl(dateStr) {
  return formatDate(dateStr, 'pl');
}

export function formatTimeZ(t) {
  if (!t) return null;
  return t.slice(0, 5) + 'z';
}
