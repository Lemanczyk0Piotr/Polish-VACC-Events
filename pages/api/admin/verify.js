// Sprawdza hasło administratora wpisane w modalu logowania (components/Layout.js)
// i tylko potwierdza, czy jest poprawne — samo hasło jest potem trzymane po
// stronie klienta (localStorage) i wysyłane jako nagłówek `x-admin-password`
// przy każdym zapisowym żądaniu do API (patrz lib/adminMode.js, lib/adminAuth.js).
export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.ADMIN_PANEL_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_PANEL_PASSWORD nie jest ustawione na serwerze.' });
  }

  const { password } = req.body || {};
  if (typeof password === 'string' && password === expected) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ error: 'Nieprawidłowe hasło.' });
}
