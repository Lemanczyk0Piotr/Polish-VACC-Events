import { runDiscordDispatch } from '../../../lib/discordDispatch';
import { isAdminRequest } from '../../../lib/adminAuth';

// Silnik automatycznych wysyłek na Discorda. Odpalany:
//  - przez Vercel Cron (patrz vercel.json) — Vercel dokłada nagłówek
//    "Authorization: Bearer <CRON_SECRET>",
//  - albo przez zewnętrzny pinger (np. cron-job.org) — wtedy sekret można
//    podać w query stringu: /api/cron/discord?secret=...
//    (przydatne, bo plan Hobby na Vercelu odpala crony tylko raz na dobę —
//    zewnętrzny pinger co godzinę daje materiałom dokładność godzinową),
//  - albo ręcznie z panelu /discord (nagłówek x-admin-password).
//
// Cały przebieg jest idempotentny (unikalne (kind, ref_key) w discord_posts),
// więc odpalenie go 24 razy na dobę nie wyśle niczego dwa razy.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    (secret && req.headers.authorization === `Bearer ${secret}`) ||
    (secret && req.query.secret === secret) ||
    isAdminRequest(req);

  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await runDiscordDispatch({ now: new Date() });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
