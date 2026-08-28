import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { colors, font, brandGradient } from '../lib/theme';
import { useLang } from '../lib/i18n';

const NAV_ITEMS = [
  { href: '/', key: 'nav.opsBriefing' },
  { href: '/events', key: 'nav.events' },
  { href: '/roster', key: 'nav.roster' },
  { href: '/positions', key: 'nav.positions' },
  { href: '/top-controllers', key: 'nav.topControllers' },
];

const EXTERNAL_LINKS = [
  { label: 'PLVACC', href: 'https://plvacc.pl' },
  { label: 'ACC Sectors', href: 'https://plvacc.pl/acc-sectors/' },
  { label: 'Statsim', href: 'https://statsim.net/' },
  { label: 'MyVATSIM', href: 'https://my.vatsim.net/home' },
];

function PlaneIcon({ size = 18, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21.5 2.5L2.5 10.2c-.5.2-.5.9.1 1.1l7.1 2.1 2.1 7.1c.2.6.9.6 1.1.1L21.5 2.5z"
        fill={color}
      />
      <path d="M12.6 13.4L10 15.9l-.6 3.4-1.7-5.9 5-.9-.1.9z" fill={color} opacity="0.55" />
    </svg>
  );
}

function SunIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="4.5" fill="#fff" />
      <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22.5" y2="12" />
        <line x1="4.4" y1="4.4" x2="6.2" y2="6.2" />
        <line x1="17.8" y1="17.8" x2="19.6" y2="19.6" />
        <line x1="4.4" y1="19.6" x2="6.2" y2="17.8" />
        <line x1="17.8" y1="6.2" x2="19.6" y2="4.4" />
      </g>
    </svg>
  );
}

function MoonIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20.5 14.7A8.5 8.5 0 1 1 9.3 3.5a7 7 0 0 0 11.2 11.2z"
        fill="#fff"
      />
    </svg>
  );
}

export default function Layout({ children }) {
  const router = useRouter();
  const { lang, setLang, t } = useLang();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Default matches the server-rendered markup (light); the real stored
  // preference is picked up client-side right after mount to avoid a
  // hydration mismatch. The theme itself is already applied instantly by
  // the inline script in pages/_document.js — this state only drives the
  // toggle button's icon.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    try {
      localStorage.setItem('pv-theme', next ? 'dark' : 'light');
    } catch (e) {
      // ignore — theme just won't persist across reloads
    }
  };

  const isActive = (href) =>
    href === '/' ? router.pathname === '/' : router.pathname.startsWith(href);

  return (
    <div style={styles.page}>
      <header style={styles.topbar}>
        <Link href="/" style={styles.brand} onClick={() => setMobileOpen(false)}>
          <span style={styles.brandMark}>
            <PlaneIcon />
          </span>
          <span style={styles.brandText}>
            <span style={styles.brandTitle}>POLISH VACC</span>
            <span style={styles.brandSub}>Events</span>
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            style={styles.langToggle}
            onClick={() => setLang(lang === 'pl' ? 'en' : 'pl')}
            aria-label={t('lang.switchTo')}
            title={t('lang.switchTo')}
          >
            {lang === 'pl' ? 'EN' : 'PL'}
          </button>
          <button
            style={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
            title={isDark ? t('theme.light') : t('theme.dark')}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="burger-btn"
            style={styles.burger}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <aside className={`app-sidebar${mobileOpen ? ' open' : ''}`} style={styles.sidebar}>
          <div style={styles.sidebarSectionLabel}>{t('nav.sectionLabel')}</div>
          <nav style={styles.navCol}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  style={{ ...styles.navLink, ...(active ? styles.navLinkActive : {}) }}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 26 }}>{t('nav.externalLinks')}</div>
          <nav style={styles.navCol}>
            {EXTERNAL_LINKS.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={styles.extLink}>
                {l.label} <span style={styles.extArrow}>↗</span>
              </a>
            ))}
          </nav>
        </aside>

        {mobileOpen && <div className="sidebar-scrim" style={styles.scrim} onClick={() => setMobileOpen(false)} />}

        <main style={styles.main}>{children}</main>
      </div>

      <footer style={styles.footer}>
        <a href="https://plvacc.pl" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
          plvacc.pl
        </a>
        <span style={{ color: colors.mutedDim }}>{t('footer.tagline')}</span>
      </footer>

      <style jsx global>{`
        html { font-size: 18px; }
        body { background: ${colors.bg}; }
        .burger-btn { display: none; }
        /* Desktop: sidebar pins itself under the topbar and scrolls only if
           its own contents (nav + external links) ever outgrow the viewport,
           instead of scrolling away with the page content. Kept out of the
           React inline style so the mobile override below (which needs
           position: fixed for the slide-in drawer) can win on narrow
           screens — an inline style would otherwise always beat it. */
        .app-sidebar {
          position: sticky;
          top: 56px;
          align-self: flex-start;
          height: calc(100vh - 56px);
          overflow-y: auto;
        }
        @media (max-width: 860px) {
          .burger-btn { display: inline-flex !important; }
          .app-sidebar {
            position: fixed;
            top: 56px;
            left: 0;
            bottom: 0;
            height: auto;
            transform: translateX(-100%);
            transition: transform 0.2s ease;
            z-index: 95;
            box-shadow: 2px 0 18px rgba(20, 12, 14, 0.18);
          }
          .app-sidebar.open { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

const SIDEBAR_WIDTH = 228;

const styles = {
  page: { minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: font.sans, display: 'flex', flexDirection: 'column' },
  topbar: {
    height: 56,
    flexShrink: 0,
    background: brandGradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.16)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brandText: { display: 'flex', flexDirection: 'column', lineHeight: 1.1 },
  brandTitle: { color: '#fff', fontWeight: 800, fontSize: '0.96rem', letterSpacing: '0.01em', fontFamily: font.display },
  brandSub: { color: 'rgba(255,255,255,0.78)', fontSize: '0.76rem', letterSpacing: '0.1em', fontWeight: 600, textTransform: 'uppercase' },
  burger: {
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    borderRadius: 8,
    padding: '6px 11px',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  themeToggle: {
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 8,
    padding: '7px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  langToggle: {
    background: 'rgba(255,255,255,0.14)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 8,
    padding: '7px 10px',
    color: '#fff',
    fontSize: '0.78rem',
    fontWeight: 800,
    letterSpacing: '0.03em',
    cursor: 'pointer',
  },
  body: { flex: 1, display: 'flex', alignItems: 'stretch' },
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    background: colors.card,
    borderRight: `1px solid ${colors.border}`,
    padding: '22px 14px',
  },
  sidebarSectionLabel: {
    color: colors.amber,
    fontSize: '0.75rem',
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '0 10px 8px',
  },
  navCol: { display: 'flex', flexDirection: 'column', gap: 2 },
  navLink: {
    padding: '10px 12px',
    borderRadius: 7,
    color: colors.muted,
    textDecoration: 'none',
    fontSize: '0.94rem',
    fontWeight: 600,
    borderLeft: '3px solid transparent',
  },
  navLinkActive: {
    background: colors.amberBg,
    color: colors.amber,
    fontWeight: 800,
    borderLeft: `3px solid ${colors.amber}`,
  },
  extLink: {
    padding: '8px 12px',
    borderRadius: 7,
    color: colors.blue,
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  extArrow: { fontSize: '0.7rem', opacity: 0.8 },
  scrim: {
    position: 'fixed',
    inset: 0,
    top: 56,
    background: 'rgba(20, 12, 14, 0.35)',
    zIndex: 90,
  },
  main: { flex: 1, minWidth: 0, padding: '28px 32px', maxWidth: 1560, margin: '0 auto', width: '100%' },
  footer: {
    borderTop: `1px solid ${colors.border}`,
    background: colors.card,
    padding: '14px 32px',
    display: 'flex',
    gap: 8,
    fontSize: '0.8rem',
    color: colors.muted,
  },
  footerLink: { color: colors.amber, textDecoration: 'none', fontWeight: 700 },
};
