import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import { colors, font, brandGradient, eventKindMeta, formatDate, formatTimeZ } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { useAdminMode } from '../lib/adminMode';

function useCountdown(targetIso) {
  // `now` starts as null on BOTH server and the first client render (rather
  // than Date.now() at render time on each) — otherwise the server's render
  // instant and the client's hydration instant almost always land in
  // different seconds, and React throws a hydration mismatch on the digit
  // that differs. The real clock only starts ticking once mounted.
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!targetIso) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [targetIso]);

  if (!targetIso || now === null) return null;
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

// Live UTC ("zulu") clock — the time format ATC actually works in, so it earns
// a prominent spot on the briefing page rather than being buried in a corner.
// Same hydration-safe pattern as useCountdown above: null until mounted, so
// server and first client render always agree (both show nothing yet).
function useClock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now === null ? null : new Date(now);
}

export default function Home() {
  const { lang, t } = useLang();
  const { isAdmin } = useAdminMode();
  const clock = useClock();
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
        if (e.status === 'completed') return false;
        // Show every scheduled upcoming event, not just those within a
        // short window — the sidebar is the full "what's coming up" list.
        const d = new Date(eventDateTime(e)).getTime();
        return d >= now;
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
          <h1 style={styles.emptyTitle}>{t('home.platformTitle')}</h1>
          <p style={styles.emptySub}>{t('home.emptySub')}</p>
          <Link href="/events" style={styles.emptyCta}>
            {t('home.emptyCta')}
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
                {countdown && (
                  <div style={styles.countdownBar}>
                    <span style={styles.countdownLabel}>
                      {countdown.live ? t('home.eventLive') : t('home.timeToEvent')}
                    </span>
                    {!countdown.live && (
                      <span style={styles.countdown}>
                        {countdown.days > 0 && <span>{String(countdown.days).padStart(2, '0')}d </span>}
                        {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:
                        {String(countdown.seconds).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                )}

                <div style={styles.eyebrow}>{t('home.nextEvent')}</div>
                {eventKindMeta[active.kind] && (
                  // Color-coded accent bar only — no label text, just the
                  // kind's color as a visual cue (kept from the old badge).
                  <span style={styles.kindAccentBar(eventKindMeta[active.kind])} />
                )}
                <h1 style={styles.title}>{active.title}</h1>
                <p style={styles.dateLine}>
                  {formatDate(active.event_date, lang)}
                  {active.time_start ? ` · ${formatTimeZ(active.time_start)}` : ''}
                  {active.time_end ? `–${formatTimeZ(active.time_end)}` : ''}
                </p>

                {active.notes && <p style={styles.notes}>{active.notes}</p>}

                <div style={styles.heroActions}>
                  {active.kind === 'event' && (
                    <Link href={`/events/${active.id}`} style={styles.scheduleLink}>
                      {t('home.viewSchedule')}
                    </Link>
                  )}
                  {active.external_link && (
                    <a href={active.external_link} target="_blank" rel="noopener noreferrer" style={styles.heroLinkBtn}>
                      {t('home.externalLink')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.mainCard}>
              <p style={styles.emptySub}>{t('home.loading')}</p>
            </div>
          )}

          {isAdmin && (
            <div style={styles.statsRow}>
              <StatTile label={t('home.statActive')} value={activeCount} />
              <StatTile label={t('home.statRegistered')} value={registeredCount} />
              <StatTile label={t('home.statEvents')} value={totalEvents} />
            </div>
          )}
        </div>

        <div style={styles.sidebarCol}>
          <div style={styles.clockCard}>
            <div style={styles.clockLabel}>{t('home.zuluLabel')}</div>
            <div style={styles.clockValue}>
              {clock
                ? `${String(clock.getUTCHours()).padStart(2, '0')}:${String(clock.getUTCMinutes()).padStart(2, '0')}:${String(clock.getUTCSeconds()).padStart(2, '0')}`
                : '--:--:--'}
              <span style={styles.clockZ}>Z</span>
            </div>
            <div style={styles.clockDate}>{clock ? formatDate(clock.toISOString().slice(0, 10), lang) : ' '}</div>
          </div>

          <aside style={styles.sidebar}>
            <div style={styles.sidebarHeader}>{t('home.sidebarHeader')}</div>
            <div style={styles.sidebarList}>
            {nearbyEvents.length === 0 && (
              <p style={{ color: colors.mutedDim, fontSize: '0.8rem' }}>{t('home.noNearby')}</p>
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
                    <div style={styles.sidebarItemDate}>{formatDate(e.event_date, lang)}</div>
                  </div>
                </button>
              );
            })}
            </div>
          </aside>
        </div>
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
    alignItems: 'stretch',
  },
  mainCard: {
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    background: colors.card,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.05)',
  },
  mainCardBody: {
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  countdownBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.cardAlt,
    padding: '12px 16px',
    marginBottom: 20,
  },
  heroActions: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 4 },
  heroLinkBtn: {
    display: 'inline-block',
    padding: '9px 16px',
    borderRadius: 8,
    border: `1px solid ${colors.blue}`,
    background: colors.blueBg,
    color: colors.blue,
    fontWeight: 700,
    fontSize: '0.82rem',
    textDecoration: 'none',
  },
  kindAccentBar: (meta) => ({
    display: 'inline-block',
    width: 44,
    height: 6,
    borderRadius: 3,
    background: meta.color,
    marginBottom: 12,
  }),
  banner: {
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    display: 'block',
    background: colors.cardAlt,
  },
  eyebrow: {
    fontSize: '0.72rem',
    fontWeight: 800,
    letterSpacing: '0.12em',
    color: colors.mutedDim,
    marginBottom: 10,
  },
  title: { fontSize: '1.9rem', margin: '0 0 8px', fontFamily: font.display, fontWeight: 700, letterSpacing: '-0.01em' },
  dateLine: { color: colors.muted, margin: '0 0 20px', fontFamily: 'monospace' },
  countdownLabel: {
    fontSize: '0.95rem',
    letterSpacing: '0.08em',
    color: colors.amber,
    fontWeight: 700,
  },
  countdown: {
    fontSize: '1.8rem',
    fontFamily: 'monospace',
    fontWeight: 800,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
  },
  notes: {
    color: colors.muted,
    fontSize: '0.95rem',
    lineHeight: 1.6,
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
  sidebarCol: { display: 'flex', flexDirection: 'column', gap: 16, height: '100%' },
  clockCard: {
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    background: brandGradient,
    padding: '18px 16px',
    textAlign: 'center',
    flexShrink: 0,
  },
  clockLabel: {
    fontSize: '0.72rem',
    letterSpacing: '0.14em',
    color: 'rgba(255,255,255,0.8)',
    fontWeight: 800,
    marginBottom: 6,
  },
  clockValue: {
    fontSize: '2.5rem',
    fontFamily: 'monospace',
    fontWeight: 800,
    letterSpacing: '0.01em',
    color: '#fff',
  },
  clockZ: { fontSize: '1.3rem', opacity: 0.75, marginLeft: 2 },
  clockDate: {
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    fontFamily: font.display,
  },
  sidebar: {
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    background: colors.card,
    padding: 16,
    flex: 1,
    minHeight: 0,
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
