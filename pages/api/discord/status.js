import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';
import { configuredTargets, configuredRoles, siteUrl } from '../../../lib/discord';

// Diagnostyka integracji dla panelu /discord: które kanały mają webhook,
// czy ustawiony jest ping roli i adres strony (linki w embedach), oraz
// ostatnie wysyłki z dziennika.
//
// UWAGA: świadomie NIE zwracamy tu URL-i webhooków ani ID roli w postaci
// pozwalającej cokolwiek wysłać — kto zna URL webhooka, może pisać na kanał
// jako bot, więc to sekret serwera. Zwracamy wyłącznie "ustawione / nie
// ustawione".
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const supabase = getSupabaseAdmin();
    const { data: posts } = await supabase
      .from('discord_posts')
      .select('id, kind, ref_key, target, status, error, sent_at, events(title)')
      .order('sent_at', { ascending: false })
      .limit(25);

    return res.status(200).json({
      targets: configuredTargets(),
      roles: configuredRoles(),
      site_url: siteUrl(),
      role_ping: Boolean((process.env.DISCORD_ROLE_ID || '').trim()),
      cron_secret: Boolean(process.env.CRON_SECRET),
      auto_announce: (process.env.DISCORD_AUTO_ANNOUNCE || '0') === '1',
      reminder_hour: process.env.DISCORD_REMINDER_HOUR || '18',
      reminder_days: process.env.DISCORD_REMINDER_DAYS || '2,1',
      signup_reminder_days: process.env.DISCORD_SIGNUP_REMINDER_DAYS || '5',
      schedule_days_before: process.env.DISCORD_SCHEDULE_DAYS_BEFORE || '1',
      recent: posts || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
