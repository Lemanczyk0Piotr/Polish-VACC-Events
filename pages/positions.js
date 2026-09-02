import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import { colors, shared } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { useAdminMode, adminFetch } from '../lib/adminMode';

const TYPES = ['CTR', 'APP', 'TWR', 'GND', 'DEL'];

export default function Positions() {
  const { t } = useLang();
  const { isAdmin, password } = useAdminMode();
  const [positions, setPositions] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  // 'ALL' | 'VISIBLE' | 'HIDDEN' — filtr widoczności przy rozpisywaniu obsady.
  // Ta strona to katalog WSZYSTKICH pozycji ATC, więc domyślnie pokazuje
  // wszystko, także ukryte.
  const [visFilter, setVisFilter] = useState('ALL');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    supabase
      .from('positions')
      .select('*')
      .order('callsign', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setPositions(data);
      });
  };

  useEffect(load, []);

  const toggleVisible = async (p) => {
    setBusyId(p.id);
    try {
      const res = await adminFetch(password, `/api/positions/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: p.visible === false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || t('positions.toggleFailed'));
        return;
      }
      load();
    } catch (e) {
      alert(t('positions.toggleFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!positions) return [];
    const q = search.trim().toLowerCase();
    return positions.filter((p) => {
      if (typeFilter !== 'ALL' && p.type !== typeFilter) return false;
      if (visFilter === 'VISIBLE' && p.visible === false) return false;
      if (visFilter === 'HIDDEN' && p.visible !== false) return false;
      if (!q) return true;
      return (
        p.callsign.toLowerCase().includes(q) ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.frequency || '').toLowerCase().includes(q)
      );
    });
  }, [positions, search, typeFilter, visFilter]);

  const grouped = useMemo(() => {
    const g = {};
    for (const p of filtered) {
      g[p.type] = g[p.type] || [];
      g[p.type].push(p);
    }
    return g;
  }, [filtered]);

  return (
    <Layout>
      <h1 style={styles.h1}>{t('positions.title')}</h1>
      <p style={styles.sub}>
        {positions ? t('positions.count', { n: positions.length }) : t('positions.loading')}
      </p>

      <div style={styles.controls}>
        <input
          type="text"
          placeholder={t('positions.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.search}
        />
        <div style={styles.filterRow}>
          <button
            onClick={() => setTypeFilter('ALL')}
            style={{ ...styles.filterBtn, ...(typeFilter === 'ALL' ? styles.filterBtnActive : {}) }}
          >
            {t('positions.all')}
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{ ...styles.filterBtn, ...(typeFilter === t ? styles.filterBtnActive : {}) }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ ...styles.filterRow, marginTop: 8 }}>
          {['ALL', 'VISIBLE', 'HIDDEN'].map((key) => (
            <button
              key={key}
              onClick={() => setVisFilter(key)}
              style={{ ...styles.filterBtn, ...(visFilter === key ? styles.filterBtnActive : {}) }}
            >
              {t(`positions.vis${key}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: colors.red }}>{error}</p>}

      {TYPES.filter((t) => grouped[t]?.length).map((type) => (
        <section key={type} style={{ marginBottom: 28 }}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>{type}</span>
            <span style={styles.sectionCount}>{grouped[type].length}</span>
          </div>
          <div style={styles.grid}>
            {grouped[type].map((p) => (
              <div key={p.id} style={{ ...styles.card, ...(p.visible === false ? styles.cardHidden : {}) }}>
                <div style={styles.cardTop}>
                  <span style={styles.callsign}>{p.callsign}</span>
                  {p.frequency && <span style={styles.freq}>{p.frequency}</span>}
                </div>
                {p.name && <div style={styles.posName}>{p.name}</div>}
                <div style={styles.cardBottom}>
                  <span style={p.visible === false ? styles.hiddenTag : styles.visibleTag}>
                    {p.visible === false ? t('positions.hiddenBadge') : t('positions.visibleBadge')}
                  </span>
                  {isAdmin && (
                    <button
                      style={styles.visBtn}
                      onClick={() => toggleVisible(p)}
                      disabled={busyId === p.id}
                    >
                      {p.visible === false ? t('positions.showBtn') : t('positions.hideBtn')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Layout>
  );
}

const styles = {
  h1: shared.h1,
  sub: shared.sub,
  controls: { marginBottom: 28 },
  search: {
    ...shared.input,
    width: '100%',
    maxWidth: 480,
    marginBottom: 12,
    display: 'block',
  },
  filterRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  filterBtn: {
    padding: '7px 16px',
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: colors.card,
    color: colors.muted,
    fontSize: '0.85rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
    cursor: 'pointer',
  },
  filterBtnActive: { background: colors.amber, color: '#fff', borderColor: colors.amber },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottom: `1px solid ${colors.border}`,
  },
  sectionLabel: {
    fontWeight: 700,
    fontSize: '0.92rem',
    letterSpacing: '0.05em',
    color: colors.amber,
  },
  sectionCount: { color: colors.muted, fontSize: '0.9rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
    gap: 12,
  },
  card: shared.card,
  // Ukryta pozycja zostaje na liście (to katalog wszystkich pozycji), ale jest
  // wyraźnie przygaszona.
  cardHidden: { opacity: 0.55, borderStyle: 'dashed' },
  cardBottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  visibleTag: { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', color: colors.green },
  hiddenTag: { fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', color: colors.mutedDim },
  visBtn: {
    padding: '5px 10px',
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  callsign: { fontWeight: 700, fontSize: '1rem' },
  freq: { color: colors.blue, fontSize: '0.95rem', fontFamily: 'monospace' },
  posName: { color: colors.muted, fontSize: '0.88rem', marginTop: 4 },
};
