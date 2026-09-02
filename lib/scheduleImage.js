// Rysuje ten sam wykres Gantta, który widać na stronie eventu po kliknięciu
// "GENERUJ HARMONOGRAM" (components/ScheduleGrid.js), na elemencie <canvas> i
// zwraca go jako PNG — po to, żeby dało się go dołączyć do wiadomości na
// Discordzie (embed nie renderuje HTML-a, może pokazać tylko obrazek).
//
// Dlaczego własny rysunek na canvasie, a nie zrzut ekranu z html2canvas:
// żadnej nowej zależności w package.json, żadnego ryzyka, że biblioteka
// inaczej zinterpretuje inline-style'e, i pełna kontrola nad tym, co trafia
// na obrazek (bez przycisków, scrolla i reszty interfejsu).
//
// Kolory pobierane są z tych samych zmiennych CSS co reszta aplikacji
// (pages/_document.js), więc obrazek wygląda dokładnie tak, jak wykres na
// ekranie — łącznie z aktualnie wybranym motywem jasnym/ciemnym.
//
// UWAGA: to działa wyłącznie w przeglądarce (potrzebuje document/canvas).
// Cron na serwerze wysyła rozpiskę bez obrazka — patrz lib/discordDispatch.js.

const TYPE_ORDER = ['CTR', 'APP', 'TWR', 'GND', 'DEL'];

// Wartości awaryjne = motyw jasny z pages/_document.js. Używane tylko gdyby
// zmienne CSS z jakiegoś powodu nie były jeszcze dostępne.
const FALLBACK = {
  '--pv-card': '#ffffff',
  '--pv-card-alt': '#f8f8fa',
  '--pv-border': '#e3e5ea',
  '--pv-border-light': '#edeef1',
  '--pv-text': '#20232b',
  '--pv-muted': '#6b7280',
  '--pv-muted-dim': '#98a0ab',
  '--pv-red': '#dc2626',
  '--pv-gold': '#b7791f',
  '--pv-blue': '#2563eb',
  '--pv-green': '#16a34a',
  '--pv-purple': '#7c3aed',
  '--pv-bar-ctr': 'rgba(220, 38, 38, 0.9)',
  '--pv-bar-app': 'rgba(183, 121, 31, 0.9)',
  '--pv-bar-twr': 'rgba(37, 99, 235, 0.9)',
  '--pv-bar-gnd': 'rgba(22, 163, 74, 0.9)',
  '--pv-bar-del': 'rgba(124, 58, 237, 0.9)',
};

function cssVar(name) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return FALLBACK[name];
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || FALLBACK[name];
}

const TYPE_COLOR_VAR = {
  CTR: '--pv-red',
  APP: '--pv-gold',
  TWR: '--pv-blue',
  GND: '--pv-green',
  DEL: '--pv-purple',
};

const TYPE_BAR_VAR = {
  CTR: '--pv-bar-ctr',
  APP: '--pv-bar-app',
  TWR: '--pv-bar-twr',
  GND: '--pv-bar-gnd',
  DEL: '--pv-bar-del',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtUtc(date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

// Wymiary w px "logicznych"; całość rysowana jest w skali 2x, żeby obrazek
// był ostry na ekranach HiDPI i po powiększeniu go w Discordzie.
const W = 1280;
const PAD = 24;
const LABEL_W = 168;
const TRACK_X = PAD + LABEL_W;
const TRACK_W = W - TRACK_X - PAD;
const HEAD_H = 86;
const TYPE_H = 30;
const ROW_H = 54;
const ROW_GAP = 8;
const GROUP_GAP = 16;
const SANS = "'IBM Plex Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Przycina tekst wielokropkiem, żeby zmieścił się w podanej szerokości —
// odpowiednik `text-overflow: ellipsis` z wykresu na stronie.
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

// Zwraca PNG jako czysty base64 (bez prefiksu "data:image/png;base64,") albo
// null, jeśli nie ma z czego zbudować wykresu (brak godzin eventu albo żadna
// zmiana nie ma ustawionych godzin) — wtedy rozpiska idzie samym tekstem.
export function renderScheduleImage(event, assignments) {
  if (typeof document === 'undefined') return null;
  if (!event?.event_date || !event.time_start || !event.time_end) return null;

  const withTimes = (assignments || []).filter((a) => a.time_start && a.time_end);
  if (withTimes.length === 0) return null;

  // Oś czasu liczona identycznie jak w ScheduleGrid: godziny eventu,
  // rozszerzone jeśli któraś zmiana wychodzi poza nie.
  let axisStart = new Date(`${event.event_date}T${event.time_start}Z`);
  let axisEnd = new Date(`${event.event_date}T${event.time_end}Z`);
  if (axisEnd <= axisStart) axisEnd = new Date(axisEnd.getTime() + 24 * 3600 * 1000);
  for (const a of withTimes) {
    const s = new Date(a.time_start);
    const e = new Date(a.time_end);
    if (s < axisStart) axisStart = s;
    if (e > axisEnd) axisEnd = e;
  }
  const totalMs = axisEnd.getTime() - axisStart.getTime();
  if (!(totalMs > 0)) return null;
  const xOf = (date) => TRACK_X + ((date.getTime() - axisStart.getTime()) / totalMs) * TRACK_W;

  // Grupowanie pozycji wg typu — jak na stronie.
  const byType = {};
  for (const type of TYPE_ORDER) byType[type] = new Map();
  for (const a of withTimes) {
    const type = a.positions?.type;
    if (!type || !byType[type]) continue;
    const key = a.position_id;
    if (!byType[type].has(key)) {
      byType[type].set(key, { callsign: a.positions?.callsign || '???', frequency: a.positions?.frequency, items: [] });
    }
    byType[type].get(key).items.push(a);
  }

  const groups = TYPE_ORDER.map((type) => ({
    type,
    positions: Array.from(byType[type].values()).sort((a, b) => a.callsign.localeCompare(b.callsign)),
  })).filter((g) => g.positions.length > 0);

  if (groups.length === 0) return null;

  const height =
    HEAD_H +
    groups.reduce((acc, g) => acc + TYPE_H + g.positions.length * (ROW_H + ROW_GAP) + GROUP_GAP, 0) +
    PAD;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';

  const c = {
    card: cssVar('--pv-card'),
    cardAlt: cssVar('--pv-card-alt'),
    border: cssVar('--pv-border'),
    borderLight: cssVar('--pv-border-light'),
    text: cssVar('--pv-text'),
    muted: cssVar('--pv-muted'),
    mutedDim: cssVar('--pv-muted-dim'),
  };

  ctx.fillStyle = c.card;
  ctx.fillRect(0, 0, W, height);

  // --- nagłówek: tytuł eventu + zakres godzin + oś czasu ---
  ctx.fillStyle = c.text;
  ctx.font = `700 20px ${SANS}`;
  ctx.fillText(fit(ctx, event.title || '', W - 2 * PAD), PAD, PAD + 12);

  ctx.fillStyle = c.muted;
  ctx.font = `500 13px ${MONO}`;
  ctx.fillText(`${event.event_date} · ${fmtUtc(axisStart)}–${fmtUtc(axisEnd)}z`, PAD, PAD + 36);

  // Podziałka co 15 minut: pełne godziny z etykietą, reszta kropką.
  const axisY = HEAD_H - 18;
  const cursor = new Date(axisStart);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(Math.ceil(cursor.getUTCMinutes() / 15) * 15);
  ctx.font = `500 12px ${MONO}`;
  while (cursor <= axisEnd) {
    const x = xOf(cursor);
    const isHour = cursor.getUTCMinutes() === 0;
    const label = isHour ? fmtUtc(cursor) : '·';
    const w = ctx.measureText(label).width;
    // Skrajne etykiety wyrównane do krawędzi, żeby nie wychodziły poza obrazek.
    let tx = x - w / 2;
    if (tx < TRACK_X) tx = TRACK_X;
    if (tx + w > TRACK_X + TRACK_W) tx = TRACK_X + TRACK_W - w;
    ctx.fillStyle = isHour ? c.muted : c.mutedDim;
    ctx.fillText(label, tx, axisY);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 15);
  }

  const quarterPx = (15 * 60 * 1000 / totalMs) * TRACK_W;

  // --- wiersze ---
  let y = HEAD_H;
  for (const group of groups) {
    const typeColor = cssVar(TYPE_COLOR_VAR[group.type]);
    const barColor = cssVar(TYPE_BAR_VAR[group.type]);

    ctx.fillStyle = typeColor;
    ctx.font = `700 14px ${SANS}`;
    ctx.fillText(group.type, PAD, y + 10);
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 22.5);
    ctx.lineTo(W - PAD, y + 22.5);
    ctx.stroke();
    y += TYPE_H;

    for (const p of group.positions) {
      const midY = y + ROW_H / 2;

      ctx.fillStyle = c.text;
      ctx.font = `700 14px ${SANS}`;
      ctx.fillText(fit(ctx, p.callsign, LABEL_W - 12), PAD, p.frequency ? midY - 8 : midY);
      if (p.frequency) {
        ctx.fillStyle = c.mutedDim;
        ctx.font = `400 12px ${MONO}`;
        ctx.fillText(p.frequency, PAD, midY + 9);
      }

      // Tor pozycji + pionowe kreski co kwadrans.
      ctx.fillStyle = c.cardAlt;
      roundRect(ctx, TRACK_X, y, TRACK_W, ROW_H, 6);
      ctx.fill();
      ctx.strokeStyle = c.borderLight;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      roundRect(ctx, TRACK_X, y, TRACK_W, ROW_H, 6);
      ctx.clip();
      ctx.strokeStyle = c.borderLight;
      for (let gx = TRACK_X + quarterPx; gx < TRACK_X + TRACK_W; gx += quarterPx) {
        ctx.beginPath();
        ctx.moveTo(Math.round(gx) + 0.5, y);
        ctx.lineTo(Math.round(gx) + 0.5, y + ROW_H);
        ctx.stroke();
      }

      // Ta sama zasada odstępu co na stronie: 20px przerwy TYLKO tam, gdzie
      // dwie zmiany faktycznie się stykają. Kafelek na brzegu osi idzie do
      // samego końca.
      const sorted = [...p.items].sort((a, b) => new Date(a.time_start) - new Date(b.time_start));
      sorted.forEach((a, idx) => {
        const s = new Date(a.time_start);
        const e = new Date(a.time_end);
        const prev = sorted[idx - 1];
        const next = sorted[idx + 1];
        const touchesPrev = prev && new Date(prev.time_end).getTime() === s.getTime();
        const touchesNext = next && new Date(next.time_start).getTime() === e.getTime();
        const GAP = 20;
        const x1 = xOf(s) + (touchesPrev ? GAP / 2 : 0);
        const x2 = xOf(e) - (touchesNext ? GAP / 2 : 0);
        const w = Math.max(2, x2 - x1);

        ctx.fillStyle = barColor;
        roundRect(ctx, x1, y + 3, w, ROW_H - 6, 5);
        ctx.fill();
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        const inner = w - 12;
        if (inner > 24) {
          const name = [a.controllers?.name, a.controllers?.rating].filter(Boolean).join(' ');
          const student = a.student?.name ? ` / uczeń: ${a.student.name}` : '';
          ctx.fillStyle = '#ffffff';
          ctx.font = `700 13px ${SANS}`;
          const nameText = fit(ctx, `${name}${student}`, inner);
          ctx.fillText(nameText, x1 + 6 + (inner - ctx.measureText(nameText).width) / 2, y + ROW_H / 2 - 8);

          ctx.font = `400 11px ${MONO}`;
          const timeText = fit(ctx, `${fmtUtc(s)}-${fmtUtc(e)}z`, inner);
          ctx.globalAlpha = 0.88;
          ctx.fillText(timeText, x1 + 6 + (inner - ctx.measureText(timeText).width) / 2, y + ROW_H / 2 + 9);
          ctx.globalAlpha = 1;
        }
      });
      ctx.restore();

      y += ROW_H + ROW_GAP;
    }
    y += GROUP_GAP;
  }

  return canvas.toDataURL('image/png').split(',')[1] || null;
}
