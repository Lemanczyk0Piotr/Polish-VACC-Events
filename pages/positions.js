import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import { colors, shared } from '../lib/theme';

const TYPES = ['CTR', 'APP', 'TWR', 'GND', 'DEL'];

export default function Positions() {
  const [positions, setPositions] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useEffect(() => {
    supabase
      .from('positions')
      .select('*')
      .order('callsign', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setPositions(data);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!positions) return [];
    const q = search.trim().toLowerCase();
    return positions.filter((p) => {
      if (typeFilter !== 'ALL' && p.type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.callsign.toLowerCase().includes(q) ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.frequency || '').toLowerCase().includes(q)
      );
    });
  }, [positions, search, typeFilter]);

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
      <h1 style={styles.h1}>POSITIONS</h1>
      <p style={styles.sub}>
        {positions ? `${positions.length} pozycji ATC` : 'Ładowanie…'}
      </p>

      <div style={styles.controls}>
        <input
          type="text"
          placeholder="Szukaj callsign, nazwy lub częstotliwości…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.search}
        />
        <div style={styles.filterRow}>
          <button
            onClick={() => setTypeFilter('ALL')}
            style={{ ...styles.filterBtn, ...(typeFilter === 'ALL' ? styles.filterBtnActive : {}) }}
          >
            ALL
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
              <div key={p.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.callsign}>{p.callsign}</span>
                  {p.frequency && <span style={styles.freq}>{p.frequency}</span>}
                </div>
                {p.name && <div style={styles.posName}>{p.name}</div>}
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
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  callsign: { fontWeight: 700, fontSize: '1rem' },
  freq: { color: colors.blue, fontSize: '0.95rem', fontFamily: 'monospace' },
  posName: { color: colors.muted, fontSize: '0.88rem', marginTop: 4 },
};
