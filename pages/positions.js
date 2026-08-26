import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

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

      {error && <p style={{ color: '#f87171' }}>{error}</p>}

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
  h1: { fontSize: '1.8rem', margin: '0 0 4px', letterSpacing: '0.02em' },
  sub: { color: '#94a3b8', margin: '0 0 20px' },
  controls: { marginBottom: 28 },
  search: {
    width: '100%',
    maxWidth: 480,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #1b2436',
    background: '#121b2e',
    color: '#e8edf7',
    fontSize: '0.9rem',
    marginBottom: 12,
    outline: 'none',
    display: 'block',
  },
  filterRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  filterBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #1b2436',
    background: '#121b2e',
    color: '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.03em',
    cursor: 'pointer',
  },
  filterBtnActive: { background: '#f5a623', color: '#0b1220', borderColor: '#f5a623' },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottom: '1px solid #1b2436',
  },
  sectionLabel: {
    fontWeight: 700,
    fontSize: '0.8rem',
    letterSpacing: '0.05em',
    color: '#f5a623',
  },
  sectionCount: { color: '#94a3b8', fontSize: '0.8rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 12,
  },
  card: {
    padding: '14px 16px',
    borderRadius: 8,
    border: '1px solid #1b2436',
    background: '#121b2e',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  callsign: { fontWeight: 700, fontSize: '0.9rem' },
  freq: { color: '#60a5fa', fontSize: '0.85rem', fontFamily: 'monospace' },
  posName: { color: '#94a3b8', fontSize: '0.8rem', marginTop: 4 },
};
