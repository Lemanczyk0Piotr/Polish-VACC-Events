import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';
import { TARGETS } from '../../../lib/discord';

// Kolejka materiałów publikowanych na Discordzie o wyznaczonej dacie i
// godzinie (opis + zdjęcie). Cała obsługa wyłącznie dla administratora —
// tabela scheduled_posts ma RLS bez polityk publicznych, więc czyta się ją
// tylko tędy, kluczem service_role.
export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('scheduled_posts')
        .select('*, events(id, title, event_date)')
        .order('publish_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { title, body, image_url, target, event_id, publish_at, mention_role } = req.body || {};
    if (!publish_at) return res.status(400).json({ error: 'publish_at jest wymagane.' });
    if (!title && !body && !image_url) {
      return res.status(400).json({ error: 'Materiał musi mieć tytuł, treść albo zdjęcie.' });
    }

    const row = {
      title: title ? String(title).trim() : null,
      body: body ? String(body).trim() : null,
      image_url: image_url ? String(image_url).trim() : null,
      target: TARGETS.includes(target) ? target : 'materials',
      event_id: event_id || null,
      publish_at: new Date(publish_at).toISOString(),
      mention_role: Boolean(mention_role),
      status: 'pending',
    };

    try {
      const { data, error } = await supabase.from('scheduled_posts').insert(row).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
