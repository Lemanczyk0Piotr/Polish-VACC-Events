import { runRosterSync } from '../../../lib/rosterSync';
import { requireAdmin } from '../../../lib/adminAuth';

// Endpoint wywoływany przyciskiem "Sync now" w UI. Teraz ograniczony do
// administratorów (patrz lib/adminAuth.js) — zwykli kontrolerzy w nowym,
// publicznym widoku strony nie mają dostępu do tego przycisku w ogóle, a
// endpoint dodatkowo sam to wymusza (nie tylko UI to ukrywa).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const result = await runRosterSync();
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
