import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'Brak event_id' });
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('event_assignments').delete().eq('event_id', event_id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'DELETE']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event_id, position_id, controller_id, time_start, time_end, session_minutes } = req.body || {};

  if (!event_id || !position_id || !controller_id) {
    return res.status(400).json({ error: 'event_id, position_id i controller_id są wymagane' });
  }

  let minutes = session_minutes || null;
  if (!minutes && time_start && time_end) {
    const diffMs = new Date(time_end).getTime() - new Date(time_start).getTime();
    minutes = diffMs > 0 ? Math.round(diffMs / 60000) : null;
  }

  const row = {
    event_id,
    position_id,
    controller_id,
    time_start: time_start || null,
    time_end: time_end || null,
    sessions: 1,
    session_minutes: minutes,
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('event_assignments').insert(row).select().single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
