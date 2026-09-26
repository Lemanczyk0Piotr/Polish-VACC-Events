import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import StatBars from '../../../components/StatBars';
import { supabase } from '../../../lib/supabaseClient';
import { colors, shared, font, positionTypeColor, eventKindMeta, eventStatusMeta, formatDate, formatTimeZ } from '../../../lib/theme';
import { useLang } from '../../../lib/i18n';
import { useAdminMode, adminFetch } from '../../../lib/adminMode';
import { aggregateStats, shiftsByPosition, fmtDuration, controllerLabel } from '../../../lib/statsAggregate';

// Statystyki pojedynczego eventu — kto gdzie siedział, ile, jak wyglądała
// obsada i ilu zapisanych kontrolerów faktycznie dostało pozycję.
//
// Strona jest publiczna (jak Top Controllers), ale podpisy kontrolerów zależą
// od trybu administratora: admin widzi „Imię Nazwisko · CID", a bez
// zalogowania widać WYŁĄCZNIE CID — ta sama granica prywatności co na
// /top-controllers.
export default function EventStats() {
  const router = useRouter();
  const { id } = router.query;
  const { lang, t } = useLang();
  // Nazwiska tylko dla administratora — bez zalogowania widać sam CID,
  // dokładnie jak na /top-controllers.
  const { isAdmin, password } = useAdminMode();

  const [event, setEvent] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [signups, setSignups] = useState([]);
  const [error, setError] = useState(null);
  // Ruch lotniczy ze Statsim — liczony po stronie serwera i cache'owany w
  // tabeli event_traffic, bo klucz API jest sekretem i nie znamy limitów
  // zewnętrznego API.
  const [traffic, setTraffic] = useState(null);
  const [trafficBusy, setTrafficBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => (err ? setError(err.message) : setEvent(data)));
    supabase
      .from('event_assignments')
      .select(
        'id, event_id, time_start, time_end, session_minutes, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating), student:controllers!event_assignments_student_id_fkey(id, name, cid), positions(callsign, type, frequency)'
      )
      .eq('event_id', id)
      .then(({ data, error: err }) => (err ? setError(err.message) : setAssignments(data || [])));
    supabase
      .from('signup_requests')
      .select('controller_id, priority, controllers(id, name, cid)')
      .eq('event_id', id)
      .then(({ data }) => setSignups(data || []));
  }, [id]);

  // Bez `doImport` endpoint czyta tylko pamięć podręczną — do Statsim idziemy
  // wyłącznie po kliknięciu przycisku przez administratora.
  // Każde zakończenie tego wywołania MUSI zmienić coś na ekranie. Pierwsza
  // wersja czytała `r.json()` bez sprawdzania `r.ok`: przy 401 albo przy
  // odpowiedzi, która nie jest JSON-em (np. strona błędu 404, gdy build jeszcze
  // nie wyszedł), kończyło się cichym wyjściem i przycisk wyglądał jak martwy.
  const loadTraffic = async (doImport = false) => {
    if (!id) return;
    setTrafficBusy(true);
    const url = `/api/statsim/${id}${doImport ? '?import=1' : ''}`;
    try {
      const res = doImport ? await adminFetch(password, url) : await fetch(url);
      const raw = await res.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        data = null;
      }
      if (!res.ok || !data) {
        setTraffic({ error: data?.error || t('stats.trafficHttp', { status: res.status }) });
      } else {
        setTraffic(data);
      }
    } catch (e) {
      setTraffic({ error: e.message });
    } finally {
      setTrafficBusy(false);
    }
  };

  useEffect(() => {
    loadTraffic(false);
  }, [id]);

  const stats = useMemo(() => aggregateStats(assignments || []), [assignments]);
  const positionsDetail = useMemo(() => shiftsByPosition(assignments || []), [assignments]);

  // Zapisani, którzy ostatecznie nie dostali żadnej zmiany — najbardziej
  // praktyczna liczba na tej stronie, bo od razu pokazuje, kogo trzeba
  // przeprosić albo doprosić następnym razem.
  const signupSummary = useMemo(() => {
    const byController = new Map();
    for (const s of signups) {
      if (!s.controllers?.id) continue;
      if (!byController.has(s.controllers.id)) byController.set(s.controllers.id, s.controllers);
    }
    const assigned = new Set((assignments || []).map((a) => a.controllers?.id).filter(Boolean));
    const all = Array.from(byController.values());
    return {
      total: all.length,
      assigned: all.filter((c) => assigned.has(c.id)).length,
      unassigned: all.filter((c) => !assigned.has(c.id)),
    };
  }, [signups, assignments]);

  if (error) {
    return (
      <Layout>
        <p style={{ color: colors.red }}>{error}</p>
      </Layout>
    );
  }

  if (!event || !assignments) {
    return (
      <Layout>
        <p style={{ color: colors.muted }}>{t('stats.loading')}</p>
      </Layout>
    );
  }

  const kindMeta = eventKindMeta[event.kind] || eventKindMeta.event;
  const kindKey = eventKindMeta[event.kind] ? event.kind : 'event';
  const statusMeta = eventStatusMeta[event.status] || eventStatusMeta.draft;
  const statusKey = eventStatusMeta[event.status] ? event.status : 'draft';

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={shared.badge(kindMeta.color, kindMeta.bg)}>{t(`events.kindLabel.${kindKey}`)}</span>
            <span style={shared.badge(statusMeta.color, 'transparent')}>{t(`events.statusLabel.${statusKey}`)}</span>
          </div>
          <h1 style={shared.h1}>{event.title}</h1>
          <p style={shared.sub}>
            {formatDate(event.event_date, lang)}
            {event.time_start ? ` · ${formatTimeZ(event.time_start)}` : ''}
            {event.time_end ? `–${formatTimeZ(event.time_end)}` : ''}
          </p>
        </div>
        <Link href={`/events/${event.id}`} style={styles.backBtn}>
          {t('stats.backToScheduler')}
        </Link>
      </div>

      <div style={styles.tiles}>
        <Tile label={t('stats.tileTotalTime')} value={fmtDuration(stats.totalMinutes)} />
        <Tile label={t('stats.tileControllers')} value={stats.controllerCount} />
        <Tile label={t('stats.tilePositions')} value={stats.positionCount} />
        <Tile label={t('stats.tileShifts')} value={stats.shiftCount} />
        <Tile label={t('stats.tileAvgPerController')} value={fmtDuration(stats.avgMinutesPerController)} />
        <Tile
          label={t('stats.tileSignups')}
          value={`${signupSummary.assigned}/${signupSummary.total}`}
          sub={t('stats.tileSignupsSub')}
        />
      </div>

      <div style={styles.twoCol}>
        <section style={shared.card}>
          <div style={styles.sectionTitle}>{t('stats.byTypeTitle')}</div>
          <StatBars
            items={stats.types.map((ty) => ({
              key: ty.type,
              label: ty.type,
              sub: t('stats.positionsCount', { n: ty.positionCount }),
              value: ty.minutes,
              color: positionTypeColor[ty.type] || colors.amber,
            }))}
            formatValue={fmtDuration}
            emptyText={t('stats.noData')}
          />
        </section>

        <section style={shared.card}>
          <div style={styles.sectionTitle}>{t('stats.topControllersTitle')}</div>
          <StatBars
            items={stats.controllers.slice(0, isAdmin ? 12 : 8).map((c) => ({
              key: c.id,
              label: controllerLabel(c, isAdmin),
              sub: `${c.rating || '—'} · ${c.positions.join(', ') || '—'}`,
              value: c.minutes,
              title: `${controllerLabel(c, isAdmin)} — ${fmtDuration(c.minutes)}, ${c.shifts} zmian`,
            }))}
            formatValue={fmtDuration}
            emptyText={t('stats.noData')}
          />
        </section>
      </div>

      {/* Dokładna rozpiska zmiana-po-zmianie jest teraz admin-only (prośba
          admina, 2026-09-03) — bez hasła widać już zbiorczo "kto kontrolował
          najdłużej" w wykresie wyżej, ale nie dokładny rozkład godzin na
          pozycję. */}
      {isAdmin && (
        <section style={{ ...shared.card, marginTop: 20 }}>
          <div style={styles.sectionTitle}>{t('stats.positionsTitle')}</div>
          {positionsDetail.length === 0 ? (
            <p style={{ color: colors.mutedDim }}>{t('stats.noData')}</p>
          ) : (
            <div style={styles.posGrid}>
              {positionsDetail.map((p) => (
                <div key={p.callsign} style={styles.posCard(positionTypeColor[p.type] || colors.border)}>
                  <div style={styles.posHead}>
                    <span style={{ fontWeight: 700 }}>{p.callsign}</span>
                    <span style={{ color: colors.mutedDim, fontFamily: font.mono, fontSize: '0.8rem' }}>
                      {fmtDuration(p.minutes)}
                    </span>
                  </div>
                  {p.items.map((it) => (
                    <div key={it.id} style={styles.shiftRow}>
                      <span style={styles.shiftTime}>
                        {it.from}–{it.to}z
                      </span>
                      <span style={{ flex: 1, minWidth: 0, ...(it.isFree ? { color: colors.mutedDim, fontStyle: 'italic' } : {}) }}>
                        {it.isFree ? (
                          t('grid.blankLabel')
                        ) : (
                          <>
                            {controllerLabel(it.controller, isAdmin)}
                            {it.student ? ` ${t('stats.studentLabel')} ${controllerLabel(it.student, isAdmin)}` : ''}
                          </>
                        )}
                      </span>
                      <span style={{ color: colors.mutedDim, fontFamily: font.mono, fontSize: '0.78rem' }}>
                        {it.isFree ? '' : fmtDuration(it.minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section style={{ ...shared.card, marginTop: 20 }}>
        <div style={styles.headerRow}>
          <div style={styles.sectionTitle}>{t('stats.trafficTitle')}</div>
          {isAdmin && (
            <button style={styles.importBtn} onClick={() => loadTraffic(true)} disabled={trafficBusy}>
              {trafficBusy
                ? t('stats.trafficBusy')
                : traffic?.totals
                  ? t('stats.trafficRefresh')
                  : t('stats.trafficImport')}
            </button>
          )}
        </div>

        {!traffic ? (
          <p style={{ color: colors.muted, margin: 0 }}>{t('stats.loading')}</p>
        ) : traffic.missing ? (
          <p style={styles.trafficNotice}>
            {traffic.can_import === false ? t('stats.trafficNoKey') : t('stats.trafficNotImported')}
          </p>
        ) : traffic.unavailable === 'no-api-key' ? (
          <p style={styles.trafficNotice}>{t('stats.trafficNoKey')}</p>
        ) : traffic.error && !traffic.totals ? (
          <p style={styles.trafficError}>{t('stats.trafficFailed', { msg: traffic.error })}</p>
        ) : traffic.note === 'no-airports' || traffic.staffed === 0 ? (
          <p style={styles.trafficNotice}>{t('stats.trafficNoAirports')}</p>
        ) : !traffic.totals || traffic.totals.movements === 0 ? (
          <p style={styles.trafficNotice}>{t('stats.trafficEmpty')}</p>
        ) : (
          <>
            <div style={styles.tiles}>
              <Tile label={t('stats.trafficMovements')} value={traffic.totals.movements} />
              <Tile label={t('stats.trafficDepartures')} value={traffic.totals.departures} />
              <Tile label={t('stats.trafficArrivals')} value={traffic.totals.arrivals} />
              <Tile label={t('stats.trafficFlights')} value={traffic.totals.flights} />
            </div>

            <div style={styles.twoCol}>
              <div>
                <div style={styles.subTitle}>{t('stats.trafficByAirport')}</div>
                <StatBars
                  items={traffic.airports.map((a) => ({
                    key: a.icao,
                    label: a.icao,
                    sub: t('stats.trafficAirportSub', { dep: a.departures, arr: a.arrivals }),
                    value: a.total,
                  }))}
                  emptyText={t('stats.noData')}
                />
              </div>
              <div>
                <div style={styles.subTitle}>{t('stats.trafficRoutes')}</div>
                <StatBars
                  items={traffic.routes.map((r) => ({ key: r.route, label: r.route, value: r.count }))}
                  emptyText={t('stats.noData')}
                />
              </div>
            </div>

            {traffic.aircraft?.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={styles.subTitle}>{t('stats.trafficAircraft')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {traffic.aircraft.map((a) => (
                    <span key={a.type} style={styles.chip}>
                      {a.type} · {a.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.trafficFoot}>
              {t('stats.trafficSource')}
              {traffic.stale ? ` · ${t('stats.trafficStale')}` : ''}
              {traffic.fetched_at
                ? ` · ${t('stats.trafficFetchedAt', { when: new Date(traffic.fetched_at).toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-GB') })}`
                : ''}
            </div>
          </>
        )}
      </section>

      {signupSummary.unassigned.length > 0 && (
        <section style={{ ...shared.card, marginTop: 20 }}>
          <div style={styles.sectionTitle}>{t('stats.unassignedTitle')}</div>
          <p style={{ color: colors.muted, fontSize: '0.88rem', margin: '0 0 10px' }}>
            {t('stats.unassignedSub', { n: signupSummary.unassigned.length })}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {signupSummary.unassigned.map((c) => (
              <span key={c.id} style={styles.chip}>
                {controllerLabel(c, isAdmin)}
              </span>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div style={styles.tile}>
      <div style={styles.tileLabel}>{label}</div>
      <div style={styles.tileValue}>{value}</div>
      {sub && <div style={styles.tileSub}>{sub}</div>}
    </div>
  );
}

const styles = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  backBtn: {
    ...shared.btnGhost,
    textDecoration: 'none',
    display: 'inline-block',
  },
  tiles: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  tile: {
    ...shared.card,
    padding: '14px 16px',
  },
  tileLabel: {
    fontFamily: font.mono,
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
    color: colors.mutedDim,
    fontWeight: 700,
    marginBottom: 6,
  },
  tileValue: { fontSize: '1.5rem', fontWeight: 700, fontFamily: font.display, color: colors.text },
  tileSub: { fontSize: '0.75rem', color: colors.mutedDim, marginTop: 4 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 },
  subTitle: {
    fontFamily: font.mono,
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
    color: colors.mutedDim,
    fontWeight: 700,
    margin: '4px 0 10px',
  },
  importBtn: {
    padding: '8px 14px',
    borderRadius: 7,
    border: `1px solid ${colors.amber}`,
    background: colors.amberBg,
    color: colors.amber,
    fontWeight: 700,
    fontSize: '0.78rem',
    letterSpacing: '0.02em',
    cursor: 'pointer',
  },
  trafficFoot: { marginTop: 14, fontSize: '0.75rem', color: colors.mutedDim },
  // Komunikaty tej sekcji są w ramce, nie jako drobny szary tekst — inaczej
  // admin klika „IMPORTUJ" i nie widzi, że cokolwiek się stało.
  trafficNotice: {
    margin: 0,
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.cardAlt,
    color: colors.muted,
    fontSize: '0.85rem',
  },
  trafficError: {
    margin: 0,
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${colors.red}`,
    background: colors.cardAlt,
    color: colors.red,
    fontSize: '0.85rem',
  },
  sectionTitle: {
    fontFamily: font.mono,
    fontSize: '0.78rem',
    letterSpacing: '0.08em',
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 14,
  },
  posGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 },
  posCard: (accent) => ({
    border: `1px solid ${colors.border}`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: 8,
    padding: '10px 12px',
    background: colors.cardAlt,
  }),
  posHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  shiftRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontSize: '0.85rem',
    padding: '3px 0',
    color: colors.text,
  },
  shiftTime: { fontFamily: font.mono, fontSize: '0.78rem', color: colors.muted, flexShrink: 0 },
  chip: {
    padding: '5px 10px',
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: colors.cardAlt,
    fontSize: '0.85rem',
  },
};
