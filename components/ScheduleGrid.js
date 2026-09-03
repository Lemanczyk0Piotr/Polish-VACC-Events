import { colors, positionTypeColor, positionTypeBarBg } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { controllerName } from '../lib/identity';

const TYPE_ORDER = ['CTR', 'APP', 'TWR', 'GND', 'DEL'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtUtc(date) {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

// Renders a Gantt-style timeline: positions grouped by type on the left,
// horizontal time axis on top, assigned controllers as colored bars placed
// at their actual shift time. Only positions with at least one assignment
// are shown — unfilled stretches of a position's track are simply empty
// space (a controller can start mid-event, matching how shifts are built).
//
// `isAdmin` (domyślnie false — ta sama zasada "mniej danych domyślnie" co w
// lib/identity.js) steruje, czy paski pokazują imię i nazwisko, czy sam CID.
// Dawniej ten komponent renderował się WYŁĄCZNIE w panelu admina, więc zawsze
// pokazywał pełne dane — teraz jest też osadzony na publicznej stronie
// /events/[id]/schedule, więc granica prywatności musi obowiązywać i tutaj.
export default function ScheduleGrid({ event, assignments, isAdmin = false }) {
  const { t } = useLang();

  if (!event.event_date || !event.time_start || !event.time_end) {
    return (
      <p style={{ color: colors.mutedDim, fontSize: '0.85rem' }}>
        {t('grid.setDates')}
      </p>
    );
  }

  const withTimes = assignments.filter((a) => a.time_start && a.time_end);
  if (withTimes.length === 0) {
    return (
      <p style={{ color: colors.mutedDim, fontSize: '0.85rem' }}>
        {t('grid.noAssignmentsWithTimes')}
      </p>
    );
  }

  // Granice "całego czasu eventu" — NIE rozciągane przez zmiany, które
  // zaczynają się wcześniej albo kończą później niż sam event (to robi
  // dopiero axisStart/axisEnd poniżej, do rysowania osi). Używane niżej do
  // wykrycia, czy jakaś pozycja ma pustą przerwę przed pierwszą albo po
  // ostatniej zmianie — wtedy dorysowujemy tam szary kafelek "BLANK"
  // (prośba admina, 2026-09-03).
  const eventStart = new Date(`${event.event_date}T${event.time_start}Z`);
  let eventEnd = new Date(`${event.event_date}T${event.time_end}Z`);
  if (eventEnd <= eventStart) eventEnd = new Date(eventEnd.getTime() + 24 * 3600 * 1000);

  let axisStart = new Date(eventStart);
  let axisEnd = new Date(eventEnd);

  for (const a of withTimes) {
    const s = new Date(a.time_start);
    const e = new Date(a.time_end);
    if (s < axisStart) axisStart = s;
    if (e > axisEnd) axisEnd = e;
  }

  const totalMs = axisEnd.getTime() - axisStart.getTime();
  const pctOf = (date) => ((date.getTime() - axisStart.getTime()) / totalMs) * 100;

  // Axis ticks every 15 minutes: full hours get a label, others a small dot.
  const ticks = [];
  const cursor = new Date(axisStart);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(Math.ceil(cursor.getUTCMinutes() / 15) * 15);
  while (cursor <= axisEnd) {
    ticks.push({ pct: pctOf(cursor), isHour: cursor.getUTCMinutes() === 0, label: fmtUtc(cursor) });
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 15);
  }
  const quarterPct = (15 * 60 * 1000 / totalMs) * 100;

  const byType = {};
  for (const t of TYPE_ORDER) byType[t] = new Map();
  for (const a of withTimes) {
    const type = a.positions?.type;
    if (!type || !byType[type]) continue;
    const key = a.position_id;
    if (!byType[type].has(key)) {
      byType[type].set(key, { callsign: a.positions?.callsign, frequency: a.positions?.frequency, items: [] });
    }
    byType[type].get(key).items.push(a);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.axisRow}>
        <div style={styles.labelCol}>
          <div style={styles.axisEventTitle} title={event.title}>
            {event.title}
          </div>
          <div style={styles.axisEventTime}>
            {fmtUtc(axisStart)}-{fmtUtc(axisEnd)}z
          </div>
        </div>
        <div style={styles.trackCol}>
          {ticks.map((t, i) => {
            // Center every label except the very first/last, which would
            // otherwise render half off the edge of the (clipped) container.
            const edgeTransform =
              t.pct <= 0.5 ? 'translateX(0)' : t.pct >= 99.5 ? 'translateX(-100%)' : 'translateX(-50%)';
            return (
              <span key={i} style={{ ...styles.tick, left: `${t.pct}%`, transform: edgeTransform }}>
                {t.isHour ? t.label : '·'}
              </span>
            );
          })}
        </div>
      </div>

      {TYPE_ORDER.map((type) => {
        const positions = Array.from(byType[type].values()).sort((a, b) => a.callsign.localeCompare(b.callsign));
        if (positions.length === 0) return null;
        const color = positionTypeColor[type];
        return (
          <div key={type} style={{ marginBottom: 18 }}>
            <div style={{ ...styles.typeLabel, color }}>{type}</div>
            {positions.map((p) => (
              <div key={p.callsign} style={styles.row}>
                <div style={styles.labelCol}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{p.callsign}</div>
                  {p.frequency && <div style={{ fontSize: '0.8rem', color: colors.mutedDim }}>{p.frequency}</div>}
                </div>
                <div
                  style={{
                    ...styles.trackCol,
                    ...styles.track,
                    backgroundImage: `linear-gradient(to right, ${colors.borderLight} 0, ${colors.borderLight} 1px, transparent 1px, transparent 100%)`,
                    backgroundSize: `${quarterPct}% 100%`,
                  }}
                >
                  {(() => {
                    // Sort so we can tell, per item, whether its left/right
                    // edge actually touches a neighboring shift on this same
                    // position — only THOSE edges get inset for a gap. An
                    // item that starts at the very beginning of the event
                    // (or ends at the very end, or simply has no adjacent
                    // shift touching it) renders flush to its real boundary
                    // instead of being shrunk on every side.
                    const sorted = [...p.items].sort(
                      (a, b) => new Date(a.time_start).getTime() - new Date(b.time_start).getTime()
                    );
                    const GAP = 20; // total px between two touching tiles (zmiana albo BLANK)

                    // Czy ta pozycja ma pustą przerwę przed pierwszą i/albo
                    // po ostatniej zmianie względem całego czasu eventu —
                    // decyduje, czy pierwszy/ostatni prawdziwy pasek dostaje
                    // inset po tej stronie (tak jakby sąsiadował z kolejną
                    // "zmianą", tylko że to szary kafelek BLANK).
                    const firstStart = new Date(sorted[0].time_start);
                    const lastEnd = new Date(sorted[sorted.length - 1].time_end);
                    const hasLeadingBlank = firstStart.getTime() > eventStart.getTime();
                    const hasTrailingBlank = lastEnd.getTime() < eventEnd.getTime();

                    const bars = sorted.map((a, idx) => {
                      const s = new Date(a.time_start);
                      const e = new Date(a.time_end);
                      const left = pctOf(s);
                      const width = pctOf(e) - left;
                      const studentName = a.student ? controllerName(a.student, isAdmin) : null;
                      const prev = sorted[idx - 1];
                      const next = sorted[idx + 1];
                      const touchesPrev = prev && new Date(prev.time_end).getTime() === s.getTime();
                      const touchesNext = next && new Date(next.time_start).getTime() === e.getTime();
                      const leftInset = touchesPrev || (idx === 0 && hasLeadingBlank) ? GAP / 2 : 0;
                      const rightInset =
                        touchesNext || (idx === sorted.length - 1 && hasTrailingBlank) ? GAP / 2 : 0;
                      return (
                        <div
                          key={a.id}
                          style={{
                            ...styles.bar,
                            left: `calc(${left}% + ${leftInset}px)`,
                            width: `calc(${width}% - ${leftInset + rightInset}px)`,
                            borderColor: color,
                            background: positionTypeBarBg[type],
                          }}
                        >
                          <div style={styles.barName}>
                            {controllerName(a.controllers, isAdmin)} {a.controllers?.rating}
                            {studentName ? `${t('grid.studentLabel')}${studentName}` : ''}
                          </div>
                          <div style={styles.barTime}>
                            {fmtUtc(s)}-{fmtUtc(e)}z
                          </div>
                        </div>
                      );
                    });

                    const blanks = [];
                    if (hasLeadingBlank) {
                      blanks.push({ key: 'blank-start', start: eventStart, end: firstStart, insetRight: true });
                    }
                    if (hasTrailingBlank) {
                      blanks.push({ key: 'blank-end', start: lastEnd, end: eventEnd, insetLeft: true });
                    }
                    const blankTiles = blanks.map((b) => {
                      const left = pctOf(b.start);
                      const width = pctOf(b.end) - left;
                      const leftInset = b.insetLeft ? GAP / 2 : 0;
                      const rightInset = b.insetRight ? GAP / 2 : 0;
                      return (
                        <div
                          key={b.key}
                          style={{
                            ...styles.bar,
                            ...styles.blankBar,
                            left: `calc(${left}% + ${leftInset}px)`,
                            width: `calc(${width}% - ${leftInset + rightInset}px)`,
                          }}
                        >
                          <div style={styles.blankLabel}>{t('grid.blankLabel')}</div>
                        </div>
                      );
                    });

                    return [...bars, ...blankTiles];
                  })()}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  // Na wąskich ekranach (telefon) trzymamy minimalną szerokość, żeby wykres
  // nie ściskał się do nieczytelności — rodzic (pages/events/[id].js) ma
  // overflowX: 'auto', więc zamiast ściskania po prostu pojawia się scroll
  // poziomy tego jednego elementu.
  wrap: { minWidth: 480 },
  axisRow: { display: 'flex', marginBottom: 10 },
  labelCol: { width: 150, flexShrink: 0 },
  axisEventTitle: {
    fontWeight: 700,
    fontSize: '0.85rem',
    lineHeight: 1.2,
    // Wrap instead of truncating — the title used to get cut off with an
    // ellipsis in this narrow column; wrapping to a couple of lines keeps
    // the full name readable (also available as a title="" tooltip).
    whiteSpace: 'normal',
    overflowWrap: 'break-word',
  },
  axisEventTime: {
    fontSize: '0.78rem',
    color: colors.mutedDim,
    fontFamily: 'monospace',
  },
  trackCol: { position: 'relative', flex: 1, minHeight: 22 },
  tick: {
    position: 'absolute',
    top: 0,
    transform: 'translateX(-50%)',
    fontSize: '0.82rem',
    color: colors.muted,
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
  typeLabel: {
    fontWeight: 700,
    fontSize: '0.92rem',
    letterSpacing: '0.05em',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: `1px solid ${colors.border}`,
  },
  row: { display: 'flex', alignItems: 'center', marginBottom: 8 },
  track: {
    height: 52,
    borderRadius: 6,
    border: `1px solid ${colors.borderLight}`,
    background: colors.cardAlt,
  },
  bar: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 5,
    // Top/bottom border only — left/right borders on two adjacent bars sit
    // only a few px apart and visually fuse into a solid colored line,
    // hiding the background gap between shifts instead of showing it.
    borderTop: '1px solid',
    borderBottom: '1px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: '0 6px',
  },
  barName: {
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.9rem',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '100%',
  },
  barTime: { color: '#fff', fontSize: '0.78rem', fontFamily: 'monospace', opacity: 0.85 },
  // Kafelek dla przerwy przed pierwszą / po ostatniej zmianie na pozycji,
  // kiedy obsada nie zajmuje całego czasu eventu (prośba admina, 2026-09-03).
  blankBar: {
    // colors.border (nie cardAlt) — cardAlt to już tło samego toru, więc
    // kafelek byłby na nim niewidoczny; ma być wyraźnie szary.
    background: colors.border,
    // Pełny shorthand (nie osobne borderStyle/borderColor) — inaczej
    // borderStyle: 'dashed' ustawiłby styl WSZYSTKICH 4 boków (łącznie z
    // lewym/prawym, które reszta paska celowo zostawia bez obramowania),
    // bo to skrót obejmujący cały border-style.
    borderTop: `1px dashed ${colors.mutedDim}`,
    borderBottom: `1px dashed ${colors.mutedDim}`,
  },
  blankLabel: {
    color: colors.mutedDim,
    fontWeight: 700,
    fontSize: '0.85rem',
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '100%',
  },
};
