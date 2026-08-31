// Prosta ochrona akcji administracyjnych (tworzenie/edycja/usuwanie eventów,
// przypisania kontrolerów, edycja rostera, sync z PLVACC) jednym wspólnym
// hasłem — bez pełnego systemu kont/logowania (patrz claude/feature-roadmap.md,
// "Autoryzacja/role" — to zostaje na później). Hasło trzymane wyłącznie w
// zmiennej środowiskowej serwera (ADMIN_PANEL_PASSWORD), sprawdzane przez
// porównanie z nagłówkiem `x-admin-password` wysyłanym przez klienta (patrz
// lib/adminMode.js -> adminFetch). To nie jest silne zabezpieczenie (jedno
// hasło dla wszystkich adminów, żadnych sesji/tokenów wygasających), ale
// realnie chroni zapisowe endpointy API — nie tylko ukrywa przyciski w UI.
export function isAdminRequest(req) {
  const expected = process.env.ADMIN_PANEL_PASSWORD;
  if (!expected) return false;
  const provided = req.headers['x-admin-password'];
  return typeof provided === 'string' && provided === expected;
}

// Zwraca true i nic nie robi jeśli żądanie jest autoryzowane; w przeciwnym
// razie od razu wysyła odpowiedź 401 i zwraca false — wywołujący powinien
// wtedy po prostu `return`.
export function requireAdmin(req, res) {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Nieprawidłowe hasło administratora.' });
    return false;
  }
  return true;
}
