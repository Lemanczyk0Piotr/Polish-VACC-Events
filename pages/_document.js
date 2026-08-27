import { Html, Head, Main, NextScript } from 'next/document';

// Theme tokens as CSS custom properties, so switching data-theme on <html>
// re-colors the whole app instantly (no React re-render needed for colors).
// Light values are the defaults on :root; [data-theme="dark"] overrides them.
const THEME_CSS = `
  :root {
    --pv-bg: #f2f3f5;
    --pv-card: #ffffff;
    --pv-card-alt: #f8f8fa;
    --pv-border: #e3e5ea;
    --pv-border-light: #edeef1;
    --pv-text: #20232b;
    --pv-muted: #6b7280;
    --pv-muted-dim: #98a0ab;
    --pv-amber: #c8102e;
    --pv-amber-bg: rgba(200, 16, 46, 0.08);
    --pv-gold: #b7791f;
    --pv-gold-bg: rgba(183, 121, 31, 0.12);
    --pv-blue: #2563eb;
    --pv-blue-bg: rgba(37, 99, 235, 0.08);
    --pv-red: #dc2626;
    --pv-red-bg: rgba(220, 38, 38, 0.08);
    --pv-green: #16a34a;
    --pv-green-bg: rgba(22, 163, 74, 0.08);
    --pv-purple: #7c3aed;
    --pv-purple-bg: rgba(124, 58, 237, 0.08);
    --pv-cyan: #0891b2;
    --pv-cyan-bg: rgba(8, 145, 178, 0.08);
    --pv-brand-gradient: linear-gradient(135deg, #7a0f1e 0%, #c8102e 55%, #e0223f 100%);
    --pv-bar-ctr: rgba(220, 38, 38, 0.9);
    --pv-bar-app: rgba(183, 121, 31, 0.9);
    --pv-bar-twr: rgba(37, 99, 235, 0.9);
    --pv-bar-gnd: rgba(22, 163, 74, 0.9);
    --pv-bar-del: rgba(124, 58, 237, 0.9);
  }
  [data-theme="dark"] {
    --pv-bg: #0d0f13;
    --pv-card: #16191f;
    --pv-card-alt: #1c2028;
    --pv-border: #2b303a;
    --pv-border-light: #23262e;
    --pv-text: #e8eaed;
    --pv-muted: #9aa1ac;
    --pv-muted-dim: #6b7280;
    --pv-amber: #f0475f;
    --pv-amber-bg: rgba(240, 71, 95, 0.16);
    --pv-gold: #dba53c;
    --pv-gold-bg: rgba(219, 165, 60, 0.16);
    --pv-blue: #6ea8ff;
    --pv-blue-bg: rgba(110, 168, 255, 0.14);
    --pv-red: #ef5350;
    --pv-red-bg: rgba(239, 83, 80, 0.14);
    --pv-green: #4ade80;
    --pv-green-bg: rgba(74, 222, 128, 0.14);
    --pv-purple: #a78bfa;
    --pv-purple-bg: rgba(167, 139, 250, 0.14);
    --pv-cyan: #22d3ee;
    --pv-cyan-bg: rgba(34, 211, 238, 0.14);
    --pv-brand-gradient: linear-gradient(135deg, #3d0a13 0%, #7a0f1e 55%, #a81830 100%);
    --pv-bar-ctr: rgba(239, 83, 80, 0.92);
    --pv-bar-app: rgba(219, 165, 60, 0.92);
    --pv-bar-twr: rgba(110, 168, 255, 0.92);
    --pv-bar-gnd: rgba(74, 222, 128, 0.92);
    --pv-bar-del: rgba(167, 139, 250, 0.92);
  }
`;

// Runs before hydration so the stored preference applies with no flash of
// the wrong theme.
const THEME_INIT_SCRIPT = `
  (function () {
    try {
      if (localStorage.getItem('pv-theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    } catch (e) {}
  })();
`;

export default function Document() {
  return (
    <Html lang="pl">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
