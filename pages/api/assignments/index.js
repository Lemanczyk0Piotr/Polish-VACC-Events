import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

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

  const { event_id, position_id, controller_id, student_id, time_start, time_end, session_minutes } = req.body || {};

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
    student_id: student_id || null,
    time_start: time_start || null,
    time_end: time_end || null,
    sessions: 1,
    session_minutes: minutes,
  };

  try {
    const supabase = getSupabaseAdmin();

    // Server-side overlap guard for the same position — the UI already
    // prevents this, but double-check here so two people can't race to fill
    // the same slot.
    if (time_start && time_end) {
      const { data: existing, error: existingErr } = await supabase
        .from('event_assignments')
        .select('id, time_start, time_end')
        .eq('position_id', position_id)
        .not('time_start', 'is', null)
        .not('time_end', 'is', null);
      if (existingErr) throw existingErr;
      const newStart = new Date(time_start).getTime();
      const newEnd = new Date(time_end).getTime();
      const overlap = (existing || []).some((a) => {
        const aStart = new Date(a.time_start).getTime();
        const aEnd = new Date(a.time_end).getTime();
        return newStart < aEnd && newEnd > aStart;
      });
      if (overlap) {
        return res.status(409).json({ error: 'Ta pozycja ma już przypisanego kontrolera w tym przedziale czasu.' });
      }
    }

    const { data, error } = await supabase.from('event_assignments').insert(row).select().single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
