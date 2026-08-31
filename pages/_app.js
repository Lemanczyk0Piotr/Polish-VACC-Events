import { LangProvider } from '../lib/i18n';
import { AdminModeProvider } from '../lib/adminMode';

export default function App({ Component, pageProps }) {
  return (
    <LangProvider>
      <AdminModeProvider>
        <Component {...pageProps} />
      </AdminModeProvider>
    </LangProvider>
  );
}
