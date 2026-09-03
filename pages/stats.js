import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import StatBars from '../components/StatBars';
import { supabase } from '../lib/supabaseClient';
import { colors, shared, font, positionTypeColor, formatDate } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { useAdminMode, adminFetch } from '../lib/adminMode';
import { aggregateStats, fmtDuration, controllerLabel } from '../lib/statsAggregate';

// Podsumowanie dowolnego okresu: jakie były eventy, kto gdzie i ile
// kontrolował, które pozycje pracowały najdłużej. Strona publiczna, ale
// nazwiska widzi tylko administrator — bez zalogowania ranking pokazuje same
// CID-y (jak /top-controllers). Przycisk wysyłki na Discorda: admin-only.

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

const PRESETS = [
  { key: 'm1', months: 1 },
  { key: 'm3', months: 3 },
  { key: 'm6', months: 6 },
  { key: 'y1', months: 12 },
];

export default function PeriodStats() {
  const { lang, t } = useLang();
  const { isAdmin, password } = useAdminMode();

  const [from, setFrom] = useState(() => isoDate(monthsAgo(3)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [onlyCompleted, setOnlyCompleted] = useState(true);
  const [events, setEvents] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setAssignments(null);

    const run = async () => {
      let query = supabase
        .from('events')
        .select('id, title, event_date, time_start, time_end, kind, status')
        .gte('event_date', from)
        .lte('event_date', to)
        .order('event_date', { ascending: false });
      if (onlyCompleted) query = query.eq('status', 'completed');

      const { data: evs, error: evErr } = await query;
      if (cancelled) return;
      if (evErr) {
        setError(evErr.message);
        return;
      }
      setEvents(evs || []);

      const ids = (evs || []).map((e) => e.id);
      if (ids.length === 0) {
        setAssignments([]);
        return;
      }
      const { data: rows, error: asErr } = await supabase
        .from('event_assignments')
        .select(
          'id, event_id, time_start, time_end, session_minutes, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating), positions(callsign, type)'
        )
        .in('event_id', ids);
      if (cancelled) return;
      if (asErr) setError(asErr.message);
      else setAssignments(rows || []);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [from, to, onlyCompleted]);

  const stats = useMemo(() => {
    if (!events || !assignments) return null;
    const byId = new Map(events.map((e) => [e.id, e]));
    return aggregateStats(assignments, byId);
  }, [events, assignments]);

  const applyPreset = (months) => {
    setFrom(isoDate(monthsAgo(months)));
    setTo(isoDate(new Date()));
  };

  const sendToDiscord = async (force = false) => {
    if (!force && !confirm(t('stats.discordConfirm'))) return;
    setSending(true);
    try {
      const res = await adminFetch(password, '/api/discord/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'period', from, to, only_completed: onlyCompleted, force }),
      });
      const data = await res.json();
      if (data?.skipped) {
        if (confirm(t('stats.discordAgain'))) {
          setSending(false);
          return sendToDiscord(true);
        }
        return;
      }
      if (!res.ok) {
        alert(`${t('stats.discordFailed')}\n${data.error || ''}`);
        return;
      }
      alert(t('stats.discordOk'));
    } catch (e) {
      alert(t('stats.discordFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <h1 style={shared.h1}>{t('stats.periodTitle')}</h1>
      <p style={shared.sub}>{t('stats.periodSub')}</p>

      <div style={{ ...shared.card, marginBottom: 20 }}>
        <div style={styles.filterRow}>
          <div>
            <div style={styles.fieldLabel}>{t('stats.from')}</div>
            <input type="date" style={shared.input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div style={styles.fieldLabel}>{t('stats.to')}</div>
            <input type="date" style={shared.input} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {PRESETS.map((p) => (
              <button key={p.key} style={styles.presetBtn} onClick={() => applyPreset(p.months)}>
                {t(`stats.preset_${p.key}`)}
              </button>
            ))}
          </div>
          <label style={styles.checkRow}>
            <input type="checkbox" checked={onlyCompleted} onChange={(e) => setOnlyCompleted(e.target.checked)} />
            <span>{t('stats.onlyCompleted')}</span>
          </label>
          {isAdmin && (
            <button style={styles.discordBtn} onClick={() => sendToDiscord()} disabled={sending || !stats}>
              {sending ? t('stats.discordBusy') : t('stats.discordBtn')}
            </button>
          )}
        </div>
      </div>

      {error && <p style={{ color: colors.red }}>{error}</p>}

      {!stats ? (
        <p style={{ color: colors.muted }}>{t('stats.loading')}</p>
      ) : stats.eventCount === 0 ? (
        <p style={{ color: colors.mutedDim }}>{t('stats.noEvents')}</p>
      ) : (
        <>
          <div style={styles.tiles}>
            <Tile label={t('stats.tileEvents')} value={stats.eventCount} />
            <Tile label={t('stats.tileTotalTime')} value={fmtDuration(stats.totalMinutes)} />
            <Tile label={t('stats.tileControllers')} value={stats.controllerCount} />
            <Tile label={t('stats.tilePositions')} value={stats.positionCount} />
            <Tile label={t('stats.tileShifts')} value={stats.shiftCount} />
            <Tile label={t('stats.tileAvgPerController')} value={fmtDuration(stats.avgMinutesPerController)} />
          </div>

          <div style={styles.twoCol}>
            <section style={shared.card}>
              <div style={styles.sectionTitle}>{t('stats.topControllersTitle')}</div>
              {/* Bez hasła admina widać krótszą listę (10 zamiast 15) — te same
                  ograniczenie duchowo co na /top-controllers (prośba admina,
                  2026-09-03): mniej danych publicznie, nic więcej. */}
              <StatBars
                items={stats.controllers.slice(0, isAdmin ? 15 : 10).map((c) => ({
                  key: c.id,
                  label: controllerLabel(c, isAdmin),
                  sub: t('stats.controllerSub', { rating: c.rating || '—', events: c.eventCount, shifts: c.shifts }),
                  value: c.minutes,
                }))}
                formatValue={fmtDuration}
                emptyText={t('stats.noData')}
              />
            </section>

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
          </div>

          <section style={{ ...shared.card, marginTop: 20 }}>
            <div style={styles.sectionTitle}>{t('stats.eventsChartTitle')}</div>
            <StatBars
              items={stats.events.map((e) => ({
                key: e.id,
                label: e.title,
                sub: `${formatDate(e.event_date, lang)} · ${t('stats.eventSub', {
                  c: e.controllerCount,
                  p: e.positionCount,
                })}`,
                value: e.minutes,
              }))}
              formatValue={fmtDuration}
              emptyText={t('stats.noData')}
            />
          </section>

          {/* Szczegółowa tabela wydarzeń (dokładne liczby per event + link do
              jeszcze dokładniejszej rozpiski) jest teraz admin-only — bez
              hasła widać już te same dane zbiorczo na wykresie wyżej, ale nie
              rozbite event-po-evencie (prośba admina, 2026-09-03: nie
              wszystkie dane muszą się pokazywać publicznie, zwłaszcza
              dokładne rozpiski). */}
          {isAdmin ? (
            <section style={{ ...shared.card, marginTop: 20 }}>
              <div style={styles.sectionTitle}>{t('stats.eventsTitle')}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>{t('stats.colDate')}</th>
                      <th style={styles.th}>{t('stats.colEvent')}</th>
                      <th style={styles.thNum}>{t('stats.colControllers')}</th>
                      <th style={styles.thNum}>{t('stats.colPositions')}</th>
                      <th style={styles.thNum}>{t('stats.colShifts')}</th>
                      <th style={styles.thNum}>{t('stats.colTime')}</th>
                      <th style={styles.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {stats.events.map((e) => (
                      <tr key={e.id}>
                        <td style={styles.tdMono}>{formatDate(e.event_date, lang)}</td>
                        <td style={styles.td}>{e.title}</td>
                        <td style={styles.tdNum}>{e.controllerCount}</td>
                        <td style={styles.tdNum}>{e.positionCount}</td>
                        <td style={styles.tdNum}>{e.shifts}</td>
                        <td style={styles.tdNum}>{fmtDuration(e.minutes)}</td>
                        <td style={styles.td}>
                          <Link href={`/events/${e.id}/stats`} style={styles.rowLink}>
                            {t('stats.details')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section style={{ ...shared.card, marginTop: 20, color: colors.mutedDim, fontSize: '0.88rem' }}>
              {t('stats.eventsTableAdminOnly')}
            </section>
          )}

          <section style={{ ...shared.card, marginTop: 20 }}>
            <div style={styles.sectionTitle}>{t('stats.positionsRankTitle')}</div>
            <StatBars
              items={stats.positions.slice(0, isAdmin ? 20 : 10).map((p) => ({
                key: p.callsign,
                label: p.callsign,
                sub: t('stats.positionSub', { c: p.controllerCount, e: p.eventCount }),
                value: p.minutes,
                color: positionTypeColor[p.type] || colors.amber,
              }))}
              formatValue={fmtDuration}
              emptyText={t('stats.noData')}
            />
          </section>
        </>
      )}
    </Layout>
  );
}

function Tile({ label, value }) {
  return (
    <div style={styles.tile}>
      <div style={styles.tileLabel}>{label}</div>
      <div style={styles.tileValue}>{value}</div>
    </div>
  );
}

const styles = {
  filterRow: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' },
  fieldLabel: { fontSize: '0.75rem', color: colors.muted, fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' },
  presetBtn: {
    padding: '9px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontWeight: 600,
    fontSize: '0.82rem',
    cursor: 'pointer',
  },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer', paddingBottom: 10 },
  discordBtn: {
    marginLeft: 'auto',
    padding: '11px 18px',
    borderRadius: 8,
    border: '1px solid #5865F2',
    background: 'rgba(88, 101, 242, 0.12)',
    color: '#4752C4',
    fontWeight: 700,
    fontSize: '0.88rem',
    cursor: 'pointer',
  },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 },
  tile: { ...shared.card, padding: '14px 16px' },
  tileLabel: {
    fontFamily: font.mono,
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
    color: colors.mutedDim,
    fontWeight: 700,
    marginBottom: 6,
  },
  tileValue: { fontSize: '1.5rem', fontWeight: 700, fontFamily: font.display, color: colors.text },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 },
  sectionTitle: {
    fontFamily: font.mono,
    fontSize: '0.78rem',
    letterSpacing: '0.08em',
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 14,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.mutedDim,
    fontFamily: font.mono,
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
  },
  thNum: {
    textAlign: 'right',
    padding: '8px 10px',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.mutedDim,
    fontFamily: font.mono,
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
  },
  td: { padding: '8px 10px', borderBottom: `1px solid ${colors.borderLight}`, color: colors.text },
  tdMono: {
    padding: '8px 10px',
    borderBottom: `1px solid ${colors.borderLight}`,
    color: colors.muted,
    fontFamily: font.mono,
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
  },
  tdNum: {
    padding: '8px 10px',
    borderBottom: `1px solid ${colors.borderLight}`,
    textAlign: 'right',
    fontFamily: font.mono,
    fontSize: '0.82rem',
    color: colors.text,
  },
  rowLink: { color: colors.amber, textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem' },
};
