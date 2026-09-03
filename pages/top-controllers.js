import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import { colors, shared, formatDate } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { useAdminMode } from '../lib/adminMode';

function fmtDuration(mins) {
  if (!mins) return '0h 00m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function TopControllers() {
  const { lang, t } = useLang();
  const { isAdmin } = useAdminMode();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    supabase
      .from('event_assignments')
      .select('id, session_minutes, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating), positions(callsign, type), events!inner(title, event_date, status)')
      .eq('events.status', 'completed')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data || []);
      });
  }, []);

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

  // Bez hasła administratora widać tylko czołową dziesiątkę — pełna lista
  // (i eksport CSV, już admin-only) zostaje zarezerwowana dla admina, żeby
  // nie ujawniać wszystkich danych rankingu publicznie (prośba admina,
  // 2026-09-03).
  const NON_ADMIN_LIMIT = 10;
  const visible = isAdmin ? ranked : ranked.slice(0, NON_ADMIN_LIMIT);

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

      {error && <p style={{ color: colors.red }}>{error}</p>}
      {!rows && !error && <p style={shared.sub}>{t('top.loading')}</p>}
      {rows && ranked.length === 0 && <p style={{ color: colors.mutedDim }}>{t('top.noData')}</p>}
      {!isAdmin && ranked.length > NON_ADMIN_LIMIT && (
        <p style={{ color: colors.mutedDim, fontSize: '0.85rem', marginTop: -12, marginBottom: 16 }}>
          {t('stats.loginForMore')}
        </p>
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
    </Layout>
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
