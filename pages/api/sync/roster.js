import { runRosterSync } from '../../../lib/rosterSync';

// Endpoint wywoływany przyciskiem "Sync now" w UI. Na razie bez logowania/ról
// (nie mamy jeszcze systemu kont) — każdy z dostępem do strony może odpalić
// synchronizację. To nieszkodliwa operacja (tylko odczyt z PLVACC + upsert),
// ale jak dodamy logowanie administratorów, warto to ograniczyć do nich.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await runRosterSync();
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
