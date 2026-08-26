import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

const EDITABLE_FIELDS = ['name', 'cid', 'rating', 'status', 'is_mentor', 'endorsements'];
const ALLOWED_STATUS = ['active', 'visitor', 'inactive'];

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Brak id' });

  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    res.setHeader('Allow', ['PUT', 'PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const update = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) update[key] = body[key];
  }
  if (update.status && !ALLOWED_STATUS.includes(update.status)) delete update.status;
  if (update.endorsements && !Array.isArray(update.endorsements)) delete update.endorsements;
  update.updated_at = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('controllers').update(update).eq('id', id).select().single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
