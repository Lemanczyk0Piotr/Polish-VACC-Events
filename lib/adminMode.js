// "Tryb administratora" — jedno wspólne hasło (nie osobne konta) rozdzielające
// panel admina (tworzenie/edycja eventów, przypisywanie kontrolerów, edycja
// rostera, sync) od widoku zwykłego kontrolera (przegląda + zapisuje się na
// eventy, nic nie edytuje). Patrz claude/feature-roadmap.md — docelowo ma to
// zastąpić prawdziwy system logowania z rolami, ale to spory osobny fundament;
// to tymczasowe rozwiązanie na już.
//
// Ten sam hydration-safe wzorzec co LangProvider/theme toggle: stan zaczyna
// jako "nie-admin" i na serwerze, i przy pierwszym renderze klienta, a dopiero
// w useEffect (czysto po stronie przeglądarki) odczytujemy zapisane hasło z
// localStorage — dzięki temu serwerowy i pierwszy kliencki render zawsze się
// zgadzają, bez błędu hydracji.
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pv-admin-pw';

const AdminModeContext = createContext({
  isAdmin: false,
  password: null,
  login: async () => ({ ok: false }),
  logout: () => {},
});

export function AdminModeProvider({ children }) {
  const [password, setPassword] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPassword(stored);
    } catch (e) {
      // ignore — po prostu nie zapamiętamy trybu admina między wizytami
    }
  }, []);

  // Zwraca { ok, code?, retryAfterMinutes? } zamiast samego booleana — modal
  // logowania (components/Layout.js) potrzebuje rozróżnić złe hasło od
  // przekroczonego limitu prób (patrz pages/api/admin/verify.js), żeby
  // pokazać właściwy komunikat zamiast zawsze "nieprawidłowe hasło".
  const login = useCallback(async (pw) => {
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, code: data.code, retryAfterMinutes: data.retryAfterMinutes };
      setPassword(pw);
      try {
        localStorage.setItem(STORAGE_KEY, pw);
      } catch (e) {
        // ignore
      }
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }, []);

  const logout = useCallback(() => {
    setPassword(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }, []);

  return (
    <AdminModeContext.Provider value={{ isAdmin: !!password, password, login, logout }}>
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  return useContext(AdminModeContext);
}

// Owija fetch() dopisując nagłówek z hasłem administratora — używane przy
// każdym zapisowym wywołaniu API (POST/PUT/PATCH/DELETE na eventach,
// przypisaniach, kontrolerach, sync rostera). Serwer sprawdza ten nagłówek w
// lib/adminAuth.js.
export function adminFetch(password, url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-admin-password': password || '',
    },
  });
}
