import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import StatBars from '../components/StatBars';
import { supabase } from '../lib/supabaseClient';
import { colors, shared, font, formatDate } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { useAdminMode } from '../lib/adminMode';

function fmtDuration(mins) {
  if (!mins) return '0h 00m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

// Bez hasła admina ranking pokazuje tylko ostatnie 3 miesiące — ten sam okres,
// co domyślny na /stats — żeby nie ujawniać publicznie danych "od zawsze"
// (prośba admina, 2026-09-03). Admin dostaje dokładnie ten sam wybór okresu
// co na /stats (presety + własny zakres dat), z domyślnym ustawieniem na te
// same 3 miesiące.
const PRESETS = [
  { key: 'm1', months: 1 },
  { key: 'm3', months: 3 },
  { key: 'm6', months: 6 },
  { key: 'y1', months: 12 },
];

export default function TopControllers() {
  const { lang, t } = useLang();
  const { isAdmin } = useAdminMode();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [from, setFrom] = useState(() => isoDate(monthsAgo(3)));
  const [to, setTo] = useState(() => isoDate(new Date()));

  // Nieadmin zawsze dostaje ostatnie 3 miesiące, niezależnie od stanu
  // pickera (który i tak się dla niego nie renderuje) — gdyby ktoś był
  // zalogowany, poustawiał inny zakres, a potem się wylogował, efektywny
  // zakres i tak wraca do stałych 3 miesięcy.
  const effectiveFrom = isAdmin ? from : isoDate(monthsAgo(3));
  const effectiveTo = isAdmin ? to : isoDate(new Date());

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    supabase
      .from('event_assignments')
      .select(
        'id, session_minutes, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating), positions(callsign, type), events!inner(title, event_date, status)'
      )
      .eq('events.status', 'completed')
      .gte('events.event_date', effectiveFrom)
      .lte('events.event_date', effectiveTo)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setRows(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveFrom, effectiveTo]);

  const ranked = useMemo(() => {
    if (!rows) return [];
    const byController = new Map();
    for (const r of rows) {
      if (!r.controllers) continue;
      const id = r.controllers.id;
      if (!byController.has(id)) {
        byController.set(id, {
          id,
          name: r.controllers.name,
          cid: r.controllers.cid,
          rating: r.controllers.rating,
          totalMinutes: 0,
          entries: [],
        });
      }
      const entry = byController.get(id);
      const minutes = r.session_minutes || 0;
      entry.totalMinutes += minutes;
      entry.entries.push({
        event: r.events?.title,
        date: r.events?.event_date,
        callsign: r.positions?.callsign,
        minutes,
      });
    }
    const list = Array.from(byController.values());
    list.sort((a, b) => b.totalMinutes - a.totalMinutes);
    for (const c of list) c.entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    return list;
  }, [rows]);

  // Rozbudowa statystyk po stronie admina (2026-09-03): podsumowanie okresu
  // w kafelkach + rozbicie czasu wg rangi — dokłada kontekst do samego
  // rankingu bez duplikowania całej strony /stats.
  const summary = useMemo(() => {
    const totalMinutes = ranked.reduce((sum, c) => sum + c.totalMinutes, 0);
    const totalSessions = ranked.reduce((sum, c) => sum + c.entries.length, 0);
    return {
      controllers: ranked.length,
      totalMinutes,
      totalSessions,
      avg: ranked.length ? Math.round(totalMinutes / ranked.length) : 0,
    };
  }, [ranked]);

  const byRating = useMemo(() => {
    const map = new Map();
    for (const c of ranked) {
      const key = c.rating || '—';
      if (!map.has(key)) map.set(key, { rating: key, minutes: 0, controllers: 0 });
      const r = map.get(key);
      r.minutes += c.totalMinutes;
      r.controllers += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
  }, [ranked]);

  // Bez hasła administratora widać tylko czołową dziesiątkę — pełna lista
  // (i eksport CSV, już admin-only) zostaje zarezerwowana dla admina, żeby
  // nie ujawniać wszystkich danych rankingu publicznie (prośba admina,
  // 2026-09-03).
  const NON_ADMIN_LIMIT = 10;
  const visible = isAdmin ? ranked : ranked.slice(0, NON_ADMIN_LIMIT);

  const applyPreset = (months) => {
    setFrom(isoDate(monthsAgo(months)));
    setTo(isoDate(new Date()));
  };

  const exportCsv = () => {
    // Non-admins only ever see CIDs in the UI (patrz render niżej) — CSV
    // eksportowane przez nich musi zachować tę samą granicę, inaczej
    // eksport ujawniałby nazwiska, które strona celowo ukrywa.
    const idLabel = isAdmin ? 'Name' : 'CID';
    const idValue = (c) => (isAdmin ? c.name : c.cid || '—');
    const lines = [['Rank', idLabel, 'Rating', 'Event', 'Date', 'Position', 'Duration (min)'].join(',')];
    ranked.forEach((c, i) => {
      c.entries.forEach((e) => {
        lines.push(
          [i + 1, csvEscape(idValue(c)), c.rating || '', csvEscape(e.event || ''), e.date || '', e.callsign || '', e.minutes].join(',')
        );
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'top-controllers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={shared.h1}>{t('top.title')}</h1>
          <p style={shared.sub}>{t('top.subtitle')}</p>
        </div>
        {isAdmin && (
          <button style={shared.btnPrimary} onClick={exportCsv} disabled={!ranked.length}>
            {t('top.exportCsv')}
          </button>
        )}
      </div>

      {isAdmin ? (
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
          </div>
        </div>
      ) : (
        <p style={{ color: colors.mutedDim, fontSize: '0.85rem', marginTop: -12, marginBottom: 16 }}>
          {t('top.periodNotice')}
        </p>
      )}

      {error && <p style={{ color: colors.red }}>{error}</p>}
      {!rows && !error && <p style={shared.sub}>{t('top.loading')}</p>}
      {rows && ranked.length === 0 && <p style={{ color: colors.mutedDim }}>{t('top.noData')}</p>}

      {isAdmin && rows && ranked.length > 0 && (
        <div style={styles.tiles}>
          <Tile label={t('stats.tileControllers')} value={summary.controllers} />
          <Tile label={t('stats.tileTotalTime')} value={fmtDuration(summary.totalMinutes)} />
          <Tile label={t('stats.tileShifts')} value={summary.totalSessions} />
          <Tile label={t('stats.tileAvgPerController')} value={fmtDuration(summary.avg)} />
        </div>
      )}

      <div style={styles.list}>
        {visible.map((c, i) => {
          // Bez hasła admina wiersz nie rozwija się w ogóle — widać tylko
          // CID, sumę godzin i liczbę sesji, bez szczegółowej rozpiski po
          // eventach/pozycjach (prośba admina, 2026-09-03).
          const row = (
            <>
              <span style={styles.rank}>#{i + 1}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <span style={{ fontWeight: 700 }}>{isAdmin ? c.name : c.cid || '—'}</span>{' '}
                {c.rating && <span style={shared.badge(colors.blue, colors.blueBg)}>{c.rating}</span>}
              </span>
              <span style={{ color: colors.amber, fontFamily: 'monospace', fontWeight: 700 }}>
                {fmtDuration(c.totalMinutes)}
              </span>
              <span style={{ color: colors.mutedDim, marginLeft: 12 }}>
                {t('top.sessions', { n: c.entries.length })}
              </span>
              {isAdmin && (
                <span style={{ marginLeft: 10, color: colors.mutedDim }}>{expanded === c.id ? '▲' : '▼'}</span>
              )}
            </>
          );
          return (
            <div key={c.id} style={shared.card}>
              {isAdmin ? (
                <button style={styles.rowBtn} onClick={() => setExpanded((v) => (v === c.id ? null : c.id))}>
                  {row}
                </button>
              ) : (
                <div style={{ ...styles.rowBtn, cursor: 'default' }}>{row}</div>
              )}

              {isAdmin && expanded === c.id && (
                <div style={styles.entries}>
                  {c.entries.map((e, idx) => (
                    <div key={idx} style={styles.entryRow}>
                      <span style={{ flex: 1 }}>
                        {e.event} <span style={{ color: colors.mutedDim }}>· {formatDate(e.date, lang)}</span>
                      </span>
                      <span style={{ color: colors.blue, fontFamily: 'monospace', marginRight: 12 }}>{e.callsign}</span>
                      <span style={{ color: colors.muted, fontFamily: 'monospace' }}>{fmtDuration(e.minutes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && rows && byRating.length > 0 && (
        <section style={{ ...shared.card, marginTop: 20 }}>
          <div style={styles.sectionTitle}>{t('top.byRatingTitle')}</div>
          <StatBars
            items={byRating.map((r) => ({
              key: r.rating,
              label: r.rating,
              sub: t('top.ratingSub', { n: r.controllers }),
              value: r.minutes,
            }))}
            formatValue={fmtDuration}
            emptyText={t('stats.noData')}
          />
        </section>
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

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const styles = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
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
  sectionTitle: {
    fontFamily: font.mono,
    fontSize: '0.78rem',
    letterSpacing: '0.08em',
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 14,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  rowBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: colors.text,
    cursor: 'pointer',
    padding: 0,
    fontSize: '1rem',
  },
  rank: { color: colors.mutedDim, fontFamily: 'monospace', width: 38 },
  entries: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${colors.borderLight}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  entryRow: { display: 'flex', alignItems: 'center', fontSize: '0.9rem' },
};
