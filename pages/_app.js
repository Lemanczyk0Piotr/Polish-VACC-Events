import { LangProvider } from '../lib/i18n';

export default function App({ Component, pageProps }) {
  return (
    <LangProvider>
      <Component {...pageProps} />
    </LangProvider>
  );
}
