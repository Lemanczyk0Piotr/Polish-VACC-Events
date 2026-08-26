import { useEffect, useState } from 'react';

export default function Home() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/bookings')
      .then((res) => {
        if (!res.ok) throw new Error('Błąd pobierania danych: ' + res.status);
        return res.json();
      })
      .then(setBookings)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.h1}>PLVACC — Zapisy na wydarzenia</h1>
        <p style={styles.p}>
          Interaktywny system zapisów na wydarzenia dla kontrolerów Polish VACC.
        </p>
        <span style={styles.badge}>🚧 W budowie</span>

        <h2 style={styles.h2}>Podgląd zapisów (na żywo z API)</h2>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {!bookings && !error && <p style={styles.p}>Ładowanie…</p>}
        {bookings && bookings.length === 0 && <p style={styles.p}>Brak zapisów.</p>}
        {bookings && bookings.length > 0 && (
          <ul style={styles.list}>
            {bookings.map((b) => (
              <li key={b.id}>
                {b.timestart}–{b.timeend} · {b.position} · {b.name} {b.surname}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0b1220',
    color: '#e8edf7',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  card: {
    maxWidth: 560,
    margin: 24,
    padding: 40,
    borderRadius: 16,
    background: '#121b2e',
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    textAlign: 'center',
  },
  h1: { margin: '0 0 8px', fontSize: '1.6rem' },
  h2: { marginTop: 32, fontSize: '1.1rem' },
  p: { color: '#94a3b8', lineHeight: 1.5 },
  badge: {
    display: 'inline-block',
    marginTop: 16,
    padding: '6px 14px',
    borderRadius: 999,
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  list: { textAlign: 'left', color: '#e8edf7', lineHeight: 1.8 },
};
