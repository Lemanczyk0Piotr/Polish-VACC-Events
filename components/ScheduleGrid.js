import { colors, positionTypeColor, positionTypeBarBg } from '../lib/theme';

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
export default function ScheduleGrid({ event, assignments }) {
  if (!event.event_date || !event.time_start || !event.time_end) {
    return (
      <p style={{ color: colors.mutedDim, fontSize: '0.85rem' }}>
        Ustaw datę oraz godzinę startu i końca wydarzenia, aby wygenerować harmonogram.
      </p>
    );
  }

  const withTimes = assignments.filter((a) => a.time_start && a.time_end);
  if (withTimes.length === 0) {
    return (
      <p style={{ color: colors.mutedDim, fontSize: '0.85rem' }}>
        Brak przypisań z ustawionym czasem — dodaj kontrolerów z zakresem godzin, aby zobaczyć harmonogram.
      </p>
    );
  }

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
        <div style={styles.labelCol} />
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
                  {p.items.map((a) => {
                    const s = new Date(a.time_start);
                    const e = new Date(a.time_end);
                    const left = pctOf(s);
                    const width = pctOf(e) - left;
                    const studentName = a.student?.name;
                    return (
                      <div
                        key={a.id}
                        style={{
                          ...styles.bar,
                          left: `${left}%`,
                          // +1px closes the hairline seam that shows up between
                          // back-to-back shifts on the same position (sub-pixel
                          // rounding otherwise leaves the gridline peeking through).
                          width: `calc(${width}% + 1px)`,
                          borderColor: color,
                          background: positionTypeBarBg[type],
                        }}
                      >
                        <div style={styles.barName}>
                          {a.controllers?.name} {a.controllers?.rating}
                          {studentName ? ` / uczeń: ${studentName}` : ''}
                        </div>
                        <div style={styles.barTime}>
                          {fmtUtc(s)}-{fmtUtc(e)}z
                        </div>
                      </div>
                    );
                  })}
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
  wrap: { overflowX: 'hidden' },
  axisRow: { display: 'flex', marginBottom: 10 },
  labelCol: { width: 150, flexShrink: 0 },
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
    border: '1px solid',
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
};
