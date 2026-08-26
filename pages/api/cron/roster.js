import { runRosterSync } from '../../../lib/rosterSync';

// Endpoint odpalany co noc przez Vercel Cron (patrz vercel.json).
// Chroniony sekretem CRON_SECRET — Vercel automatycznie dokłada nagłówek
// "Authorization: Bearer <CRON_SECRET>" do zaplanowanych wywołań, więc
// nikt z zewnątrz nie może tego wywołać bez znajomości sekretu.
export default async function handler(req, res) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runRosterSync();
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
