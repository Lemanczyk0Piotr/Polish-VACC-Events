// Sprawdza hasło administratora wpisane w modalu logowania (components/Layout.js)
// i tylko potwierdza, czy jest poprawne — samo hasło jest potem trzymane po
// stronie klienta (localStorage) i wysyłane jako nagłówek `x-admin-password`
// przy każdym zapisowym żądaniu do API (patrz lib/adminMode.js, lib/adminAuth.js).
//
// Limit prób logowania (dodane 2026-09-02, na prośbę admina) — bez tego
// ktokolwiek mógłby skryptem próbować zgadywać ADMIN_PANEL_PASSWORD bez
// żadnego ograniczenia. Każda NIEUDANA próba dla danego adresu IP jest
// zapisywana w tabeli `admin_login_attempts`; jeśli w ciągu ostatnich
// WINDOW_MINUTES minut było ich MAX_ATTEMPTS lub więcej, kolejne próby są
// odrzucane (429) zanim w ogóle porównamy podane hasło — nawet z poprawnym
// hasłem trzeba wtedy poczekać. Poprawne logowanie czyści historię prób dla
// tego IP (nie karzemy legalnego admina, który się kilka razy pomylił, a
// potem trafił). Stan trzymany w Supabase (nie w pamięci procesu) — na
// Vercelu każde wywołanie funkcji może trafić do innej instancji, więc
// licznik w zwykłej zmiennej JS nie przetrwałby między żądaniami.
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Sprzątanie starych wierszy — nie trzymamy historii dłużej niż potrzeba do
// samego limitu, żeby tabela się nie rozrastała bez końca.
const CLEANUP_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.ADMIN_PANEL_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_PANEL_PASSWORD nie jest ustawione na serwerze.' });
  }

  const ip = getClientIp(req);
  const supabase = getSupabaseAdmin();

  // Sprzątanie w tle — nie musimy na to czekać, żeby odpowiedzieć na to
  // konkretne żądanie, ale nie zgłaszamy z tego błędu (nie jest krytyczne).
  supabase
    .from('admin_login_attempts')
    .delete()
    .lt('created_at', new Date(Date.now() - CLEANUP_OLDER_THAN_MS).toISOString())
    .then(() => {}, () => {});

  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: recentAttempts, error: countErr } = await supabase
    .from('admin_login_attempts')
    .select('created_at')
    .eq('ip', ip)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });

  if (countErr) {
    // Jeśli sam licznik zawiedzie, nie blokujemy logowania z powodu naszego
    // błędu — po prostu logujemy się bez rate-limitu na tę jedną próbę.
    console.error('admin_login_attempts count failed:', countErr.message);
  } else if ((recentAttempts || []).length >= MAX_ATTEMPTS) {
    const oldest = new Date(recentAttempts[0].created_at).getTime();
    const retryAfterMinutes = Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 60000));
    return res.status(429).json({
      error: `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${retryAfterMinutes} min.`,
      code: 'rate_limited',
      retryAfterMinutes,
    });
  }

  const { password } = req.body || {};
  if (typeof password === 'string' && password === expected) {
    // Udane logowanie — czyścimy historię nieudanych prób dla tego IP, żeby
    // kilka literówek przed trafieniem poprawnego hasła nie zbliżały admina
    // do limitu przy okazji.
    await supabase.from('admin_login_attempts').delete().eq('ip', ip);
    return res.status(200).json({ ok: true });
  }

  await supabase.from('admin_login_attempts').insert({ ip });
  return res.status(401).json({ error: 'Nieprawidłowe hasło.', code: 'invalid_password' });
}
