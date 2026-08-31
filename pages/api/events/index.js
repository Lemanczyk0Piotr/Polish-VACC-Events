import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';

const ALLOWED_KIND = ['event', 'exam', 'announcement'];
const ALLOWED_STATUS = ['draft', 'published', 'completed'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const {
    title,
    event_date,
    time_start,
    time_end,
    kind,
    category,
    status,
    image_url,
    notes,
    external_link,
  } = req.body || {};

  if (!title || !event_date) {
    return res.status(400).json({ error: 'title i event_date są wymagane' });
  }

  const row = {
    title: String(title).trim(),
    event_date,
    time_start: time_start || null,
    time_end: kind === 'exam' || kind === 'announcement' ? null : time_end || null,
    kind: ALLOWED_KIND.includes(kind) ? kind : 'event',
    category: category || null,
    status: ALLOWED_STATUS.includes(status) ? status : 'draft',
    image_url: image_url || null,
    notes: notes || null,
    external_link: external_link || null,
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('events').insert(row).select().single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
