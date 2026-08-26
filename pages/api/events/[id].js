import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

const ALLOWED_KIND = ['event', 'exam', 'announcement'];
const ALLOWED_STATUS = ['draft', 'published', 'completed'];
const EDITABLE_FIELDS = [
  'title',
  'event_date',
  'time_start',
  'time_end',
  'kind',
  'category',
  'status',
  'image_url',
  'notes',
  'external_link',
];

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Brak id' });

  const supabase = getSupabaseAdmin();

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = req.body || {};
    const update = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) update[key] = body[key];
    }
    if (update.kind && !ALLOWED_KIND.includes(update.kind)) delete update.kind;
    if (update.status && !ALLOWED_STATUS.includes(update.status)) delete update.status;
    if (update.kind === 'exam' || update.kind === 'announcement') update.time_end = null;
    update.updated_at = new Date().toISOString();

    try {
      const { data, error } = await supabase.from('events').update(update).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await supabase.from('event_assignments').delete().eq('event_id', id);
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', ['PUT', 'PATCH', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}
