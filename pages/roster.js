import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

export default function Roster() {
  const [controllers, setControllers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('controllers')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setControllers(data);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!controllers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return controllers;
    return controllers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.cid || '').toLowerCase().includes(q) ||
        (c.rating || '').toLowerCase().includes(q)
    );
  }, [controllers, search]);

  return (
    <Layout>
      <h1 style={styles.h1}>ROSTER</h1>
      <p style={styles.sub}>
        {controllers ? `${controllers.length} kontrolerów zarejestrowanych` : 'Ładowanie…'}
      </p>

      <input
        type="text"
        placeholder="Szukaj po nazwisku, CID lub ratingu…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={styles.search}
      />

      {error && <p style={{ color: '#f87171' }}>{error}</p>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>NAME</th>
              <th style={styles.th}>VATSIM CID</th>
              <th style={styles.th}>RATING</th>
              <th style={styles.th}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={styles.tr}>
                <td style={styles.td}>
                  {c.name}
                  {c.is_mentor && <span style={styles.mentorBadge}>MENTOR</span>}
                </td>
                <td style={styles.td}>{c.cid || '—'}</td>
                <td style={styles.td}>
                  {c.rating && <span style={styles.ratingBadge}>{c.rating}</span>}
                </td>
                <td style={styles.td}>
                  <span style={styles.statusDot} /> {c.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

const styles = {
  h1: { fontSize: '1.8rem', margin: '0 0 4px', letterSpacing: '0.02em' },
  sub: { color: '#94a3b8', margin: '0 0 20px' },
  search: {
    width: '100%',
    maxWidth: 480,
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #1b2436',
    background: '#121b2e',
    color: '#e8edf7',
    fontSize: '0.9rem',
    marginBottom: 24,
    outline: 'none',
  },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid #1b2436' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    color: '#94a3b8',
    fontWeight: 600,
    fontSize: '0.75rem',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #1b2436',
    background: '#0e1626',
  },
  tr: { borderBottom: '1px solid #151d2e' },
  td: { padding: '12px 16px' },
  ratingBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 6,
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  mentorBadge: {
    marginLeft: 8,
    padding: '2px 8px',
    borderRadius: 6,
    background: 'rgba(245, 166, 35, 0.15)',
    color: '#f5a623',
    fontSize: '0.65rem',
    fontWeight: 700,
  },
  statusDot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#34d399',
    marginRight: 6,
  },
};
