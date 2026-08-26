import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { colors, font } from '../lib/theme';

const NAV_ITEMS = [
  { href: '/', label: 'OPS BRIEFING' },
  { href: '/events', label: 'EVENTS' },
  { href: '/roster', label: 'ROSTER' },
  { href: '/positions', label: 'POSITIONS' },
  { href: '/top-controllers', label: 'TOP CONTROLLERS' },
];

const EXTERNAL_LINKS = [
  { label: 'PLVACC', href: 'https://plvacc.pl' },
  { label: 'ACC SECTORS', href: 'https://plvacc.pl/acc-sectors/' },
  { label: 'STATSIM', href: 'https://statsim.net/' },
  { label: 'MyVATSIM', href: 'https://my.vatsim.net/home' },
];

export default function Layout({ children }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href) =>
    href === '/' ? router.pathname === '/' : router.pathname.startsWith(href);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerRow}>
          <a href="https://plvacc.pl" target="_blank" rel="noopener noreferrer" style={styles.brand}>
            <span style={styles.brandDot} />
            <span>PLVACC EVENTS</span>
          </a>

          <button
            className="burger-btn"
            style={styles.burger}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>

          <div className="desktop-only-nav" style={styles.desktopOnly}>
            <nav style={styles.nav}>
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ ...styles.navLink, ...(isActive(item.href) ? styles.navLinkActive : {}) }}
                >
                  {item.label}
                </Link>
              ))}
              <span style={styles.navSep} />
              {EXTERNAL_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.extLink}
                >
                  {l.label} ↗
                </a>
              ))}
            </nav>
          </div>
        </div>

        {mobileOpen && (
          <nav style={styles.mobileNav}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                style={{ ...styles.navLink, ...(isActive(item.href) ? styles.navLinkActive : {}) }}
              >
                {item.label}
              </Link>
            ))}
            <span style={{ ...styles.navSep, width: '100%', height: 1, margin: '6px 0' }} />
            {EXTERNAL_LINKS.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={styles.extLink}>
                {l.label} ↗
              </a>
            ))}
          </nav>
        )}
      </header>

      <main style={styles.main}>{children}</main>

      <footer style={styles.footer}>
        <a href="https://plvacc.pl" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
          plvacc.pl
        </a>
        <span style={{ color: colors.mutedDim }}>· Polish VACC Events Platform</span>
      </footer>

      <style jsx global>{`
        @media (max-width: 860px) {
          .desktop-only-nav {
            display: none !important;
          }
          .burger-btn {
            display: inline-block !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: colors.bg,
    color: colors.text,
    fontFamily: font.sans,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: `1px solid ${colors.border}`,
    padding: '14px 32px',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: colors.text,
    textDecoration: 'none',
    fontFamily: font.mono,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    background: colors.amber,
    display: 'inline-block',
    boxShadow: `0 0 10px ${colors.amber}`,
  },
  burger: {
    display: 'none',
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.text,
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  desktopOnly: { flex: 1 },
  nav: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  navLink: {
    padding: '8px 12px',
    borderRadius: 6,
    color: colors.muted,
    textDecoration: 'none',
    fontSize: '0.75rem',
    letterSpacing: '0.04em',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  navLinkActive: {
    background: colors.amber,
    color: colors.bg,
  },
  navSep: {
    width: 1,
    height: 18,
    background: colors.border,
    margin: '0 4px',
  },
  extLink: {
    padding: '8px 10px',
    borderRadius: 6,
    color: colors.blue,
    textDecoration: 'none',
    fontSize: '0.7rem',
    letterSpacing: '0.03em',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  mobileNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 12,
  },
  main: {
    flex: 1,
    padding: '32px',
    maxWidth: 1200,
    margin: '0 auto',
    width: '100%',
  },
  footer: {
    borderTop: `1px solid ${colors.border}`,
    padding: '16px 32px',
    display: 'flex',
    gap: 8,
    fontSize: '0.8rem',
    color: colors.muted,
  },
  footerLink: { color: colors.amber, textDecoration: 'none', fontWeight: 700 },
};
