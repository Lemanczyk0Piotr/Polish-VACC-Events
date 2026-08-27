import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import { colors, font, eventKindMeta, formatDatePl, formatTimeZ } from '../lib/theme';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function useCountdown(targetIso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [targetIso]);

  if (!targetIso) return null;
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return { live: true };
  const days = Math.floor(diff / (24 * 3600 * 1000));
  const hours = Math.floor((diff / (3600 * 1000)) % 24);
  const minutes = Math.floor((diff / (60 * 1000)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { live: false, days, hours, minutes, seconds };
}

function eventDateTime(ev) {
  // event_date is a plain date, time_start is a plain time (both treated as UTC/Z
  // "zulu" the way controllers enter them, matching how times were entered originally).
  const t = ev.time_start || '00:00:00';
  return `${ev.event_date}T${t}Z`;
}

export default function Home() {
  const [events, setEvents] = useState(null);
  const [controllers, setControllers] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .then(({ data }) => setEvents(data || []));
    supabase
      .from('controllers')
      .select('id, status')
      .then(({ data }) => setControllers(data || []));
  }, []);

  const today = useMemo(() => new Date(), []);

  const nearbyEvents = useMemo(() => {
    if (!events) return [];
    const now = today.getTime();
    return events
      .filter((e) => {
        const d = new Date(eventDateTime(e)).getTime();
        return Math.abs(d - now) <= WEEK_MS;
      })
      .sort((a, b) => new Date(eventDateTime(a)) - new Date(eventDateTime(b)));
  }, [events, today]);

  const defaultEvent = useMemo(() => {
    if (!events || events.length === 0) return null;
    const now = today.getTime();
    const upcoming = events
      .filter((e) => e.status !== 'completed' && new Date(eventDateTime(e)).getTime() >= now)
      .sort((a, b) => new Date(eventDateTime(a)) - new Date(eventDateTime(b)));
    if (upcoming[0]) return upcoming[0];
    const notCompleted = events.find((e) => e.status !== 'completed');
    if (notCompleted) return notCompleted;
    return [...events].sort((a, b) => new Date(eventDateTime(b)) - new Date(eventDateTime(a)))[0];
  }, [events, today]);

  useEffect(() => {
    if (defaultEvent && !selectedId) setSelectedId(defaultEvent.id);
  }, [defaultEvent, selectedId]);

  const active = useMemo(
    () => events?.find((e) => e.id === selectedId) || defaultEvent,
    [events, selectedId, defaultEvent]
  );

  const countdown = useCountdown(active ? eventDateTime(active) : null);

  const activeCount = controllers?.filter((c) => c.status === 'active' || c.status === 'visitor').length ?? null;
  const registeredCount = controllers?.filter((c) => c.status !== 'inactive').length ?? null;
  const totalEvents = events?.length ?? null;

  if (events && events.length === 0) {
    return (
      <Layout>
        <div style={styles.empty}>
          <h1 style={styles.emptyTitle}>PLVACC Event Scheduling Platform</h1>
          <p style={styles.emptySub}>Stwórz swoje pierwsze wydarzenie, aby zacząć.</p>
          <Link href="/events" style={styles.emptyCta}>
            + NOWE WYDARZENIE
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={styles.grid}>
        <div>
          {active ? (
            <div style={styles.mainCard}>
              {active.image_url && (
                <img src={active.image_url} alt="" style={styles.banner} />
              )}
              <div style={styles.mainCardBody}>
                {eventKindMeta[active.kind] && (
                  <span style={styles.kindBadge(eventKindMeta[active.kind])}>
                    {eventKindMeta[active.kind].label}
                  </span>
                )}
                <h1 style={styles.title}>{active.title}</h1>
                <p style={styles.dateLine}>
                  {formatDatePl(active.event_date)}
                  {active.time_start ? ` · ${formatTimeZ(active.time_start)}` : ''}
                  {active.time_end ? `–${formatTimeZ(active.time_end)}` : ''}
                </p>

                <div style={styles.countdownWrap}>
                  <div style={styles.countdownLabel}>
                    {countdown?.live ? 'EVENT LIVE / PAST' : 'TIME TO EVENT'}
                  </div>
                  {countdown && !countdown.live && (
                    <div style={styles.countdown}>
                      {String(countdown.days).padStart(2, '0')}d{' '}
                      {String(countdown.hours).padStart(2, '0')}:
                      {String(countdown.minutes).padStart(2, '0')}:
                      {String(countdown.seconds).padStart(2, '0')}
                    </div>
                  )}
                </div>

                {active.notes && <p style={styles.notes}>{active.notes}</p>}

                {active.kind === 'event' && (
                  <Link href={`/events/${active.id}`} style={styles.scheduleLink}>
                    Zobacz harmonogram →
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.mainCard}>
              <p style={styles.emptySub}>Ładowanie…</p>
            </div>
          )}

          <div style={styles.statsRow}>
            <StatTile label="AKTYWNI KONTROLERZY" value={activeCount} />
            <StatTile label="ZAREJESTROWANI" value={registeredCount} />
            <StatTile label="WYDARZENIA" value={totalEvents} />
          </div>
        </div>

        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>OSTATNIE I NADCHODZĄCE WYDARZENIA</div>
          <div style={styles.sidebarList}>
            {nearbyEvents.length === 0 && (
              <p style={{ color: colors.mutedDim, fontSize: '0.8rem' }}>Brak wydarzeń w ciągu ±1 tygodnia.</p>
            )}
            {nearbyEvents.map((e) => {
              const meta = eventKindMeta[e.kind] || eventKindMeta.event;
              const isActive = active && e.id === active.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  style={{
                    ...styles.sidebarItem,
                    ...(isActive ? styles.sidebarItemActive(meta.color) : {}),
                  }}
                >
                  <div style={{ ...styles.sidebarDot, background: meta.color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.sidebarItemTitle}>{e.title}</div>
                    <div style={styles.sidebarItemDate}>{formatDatePl(e.event_date)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </Layout>
  );
}

function StatTile({ label, value }) {
  return (
    <div style={styles.tile}>
      <div style={styles.tileValue}>{value ?? '—'}</div>
      <div style={styles.tileLabel}>{label}</div>
    </div>
  );
}

const styles = {
  empty: { textAlign: 'center', padding: '80px 20px' },
  emptyTitle: { fontSize: '2rem', margin: '0 0 10px', fontFamily: font.display, fontWeight: 700 },
  emptySub: { color: colors.muted },
  emptyCta: {
    display: 'inline-block',
    marginTop: 20,
    padding: '12px 22px',
    borderRadius: 8,
    background: colors.amber,
    color: colors.bg,
    fontWeight: 700,
    textDecoration: 'none',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 300px',
    gap: 24,
    alignItems: 'start',
  },
  mainCard: {
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    background: colors.card,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.05)',
  },
  mainCardBody: { padding: '28px' },
  kindBadge: (meta) => ({
    display: 'inline-block',
    marginBottom: 12,
    padding: '3px 10px',
    borderRadius: 6,
    background: meta.bg,
    color: meta.color,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
  }),
  banner: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    display: 'block',
    background: colors.cardAlt,
  },
  title: { fontSize: '1.9rem', margin: '0 0 8px', fontFamily: font.display, fontWeight: 700, letterSpacing: '-0.01em' },
  dateLine: { color: colors.muted, margin: '0 0 20px', fontFamily: 'monospace' },
  countdownWrap: { margin: '20px 0' },
  countdownLabel: {
    fontSize: '0.75rem',
    letterSpacing: '0.1em',
    color: colors.amber,
    fontWeight: 700,
    marginBottom: 6,
  },
  countdown: {
    fontSize: '2.4rem',
    fontFamily: 'monospace',
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  notes: {
    color: colors.muted,
    fontSize: '0.95rem',
    lineHeight: 1.6,
    maxWidth: 640,
    margin: '0 0 12px',
    whiteSpace: 'pre-wrap',
  },
  scheduleLink: {
    display: 'inline-block',
    marginTop: 8,
    color: colors.amber,
    fontWeight: 700,
    fontSize: '0.85rem',
    textDecoration: 'none',
  },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 },
  tile: {
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.card,
    padding: '16px 10px',
    textAlign: 'center',
  },
  tileValue: { fontSize: '1.7rem', fontWeight: 700, fontFamily: 'monospace' },
  tileLabel: { fontSize: '0.76rem', color: colors.muted, letterSpacing: '0.04em', marginTop: 4 },
  sidebar: {
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    background: colors.card,
    padding: 16,
    maxHeight: 560,
    overflowY: 'auto',
  },
  sidebarHeader: {
    fontSize: '0.8rem',
    letterSpacing: '0.04em',
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 12,
  },
  sidebarList: { display: 'flex', flexDirection: 'column', gap: 6 },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 10px',
    borderRadius: 8,
    border: `1px solid transparent`,
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    color: colors.text,
    width: '100%',
  },
  sidebarItemActive: (color) => ({
    background: colors.cardAlt,
    border: `1px solid ${color}`,
  }),
  sidebarDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  sidebarItemTitle: {
    fontSize: '0.82rem',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sidebarItemDate: { fontSize: '0.8rem', color: colors.mutedDim, marginTop: 2 },
};
