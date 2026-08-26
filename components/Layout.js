import Link from 'next/link';
import { useRouter } from 'next/router';

const NAV_ITEMS = [
  { href: '/', label: 'OPS BRIEFING' },
  { href: '/roster', label: 'ROSTER' },
  { href: '/positions', label: 'POSITIONS' },
];

export default function Layout({ children }) {
  const router = useRouter();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <span style={styles.brandDot} />
          <span>PLVACC EVENTS</span>
        </div>
        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...styles.navLink,
                  ...(active ? styles.navLinkActive : {}),
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0b1220',
    color: '#e8edf7',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 32px',
    borderBottom: '1px solid #1b2436',
    flexWrap: 'wrap',
    gap: 16,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    background: '#f5a623',
    display: 'inline-block',
  },
  nav: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  navLink: {
    padding: '8px 14px',
    borderRadius: 6,
    color: '#94a3b8',
    textDecoration: 'none',
    fontSize: '0.8rem',
    letterSpacing: '0.04em',
    fontWeight: 600,
  },
  navLinkActive: {
    background: '#f5a623',
    color: '#0b1220',
  },
  main: {
    padding: '32px',
    maxWidth: 1200,
    margin: '0 auto',
  },
};
