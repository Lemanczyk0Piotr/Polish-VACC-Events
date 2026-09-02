import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';
import { TARGETS } from '../../../lib/discord';
import { publishScheduledPost } from '../../../lib/discordDispatch';

const EDITABLE = ['title', 'body', 'image_url', 'target', 'event_id', 'publish_at', 'mention_role', 'status'];

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Brak id' });
  if (!requireAdmin(req, res)) return;

  const supabase = getSupabaseAdmin();

  // POST { action: 'send' } — publikacja "od ręki", bez czekania na cron
  // (np. materiał, który miał pójść wieczorem, a admin chce go teraz).
  if (req.method === 'POST') {
    try {
      const { data: post, error } = await supabase.from('scheduled_posts').select('*').eq('id', id).single();
      if (error) throw error;
      const result = await publishScheduledPost(supabase, post);
      if (!result.ok) return res.status(502).json(result);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = req.body || {};
    const update = {};
    for (const key of EDITABLE) if (key in body) update[key] = body[key];
    if (update.target && !TARGETS.includes(update.target)) delete update.target;
    if (update.publish_at) update.publish_at = new Date(update.publish_at).toISOString();
    if ('mention_role' in update) update.mention_role = Boolean(update.mention_role);
    // Zmiana treści albo terminu materiału, który jeszcze nie poszedł,
    // zeruje ewentualny wcześniejszy błąd i wraca do kolejki.
    if (update.status === undefined && (update.publish_at || update.body || update.title)) {
      update.status = 'pending';
      update.error = null;
    }
    update.updated_at = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('scheduled_posts')
        .update(update)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabase.from('scheduled_posts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', ['POST', 'PUT', 'PATCH', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}
