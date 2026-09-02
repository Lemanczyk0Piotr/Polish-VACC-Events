import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';

// Celowo BEZ requireAdmin — to jedyny zapisowy endpoint dostępny dla zwykłych
// kontrolerów (nie ma jeszcze logowania per-kontroler, więc tożsamość to po
// prostu wybór własnego imienia z listy w formularzu, patrz pages/events/[id].js).
export default async function handler(req, res) {
  // Usunięcie zgłoszenia — TYLKO dla administratora (inaczej ktokolwiek mógłby
  // wypisać dowolnego kontrolera). Jedno zgłoszenie to do 3 wierszy
  // (priority 1-3), więc kasujemy komplet po parze (event_id, controller_id).
  if (req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const { event_id, controller_id } = req.query;
    if (!event_id || !controller_id) {
      return res.status(400).json({ error: 'event_id i controller_id są wymagane.' });
    }
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('signup_requests')
        .delete()
        .eq('event_id', event_id)
        .eq('controller_id', controller_id);
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

  const { event_id, controller_id, choices, notes, time_start, time_end } = req.body || {};

  if (!event_id || !controller_id || !Array.isArray(choices) || choices.length === 0) {
    return res
      .status(400)
      .json({ error: 'event_id, controller_id i przynajmniej jedna preferencja pozycji są wymagane.' });
  }

  const rows = choices
    .filter((c) => c && Number(c.priority) >= 1 && Number(c.priority) <= 3)
    .map((c) => ({
      event_id,
      controller_id,
      preferred_position_id: c.position_id || null,
      priority: Number(c.priority),
      notes: notes ? String(notes).trim() || null : null,
      // Same preferred hours applied to every priority row of this signup —
      // it's one availability window per controller per event, not per pick.
      preferred_time_start: time_start ? `${time_start}:00` : null,
      preferred_time_end: time_end ? `${time_end}:00` : null,
      status: 'pending',
    }));

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Brak poprawnych preferencji.' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Zapisy na zakończone wydarzenie są zamknięte. UI w ogóle nie pokazuje
    // wtedy formularza, ale ten endpoint jest publiczny (bez hasła admina),
    // więc sprawdzenie musi być też tutaj.
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('status')
      .eq('id', event_id)
      .single();
    if (eventErr) throw eventErr;
    if (event?.status === 'completed') {
      return res.status(409).json({ error: 'To wydarzenie już się odbyło — zapisy są zamknięte.' });
    }
    // Upsert po (event_id, controller_id, priority) — jeśli kontroler zmieni
    // zdanie i wyśle formularz ponownie, aktualizuje swoje wcześniejsze
    // zgłoszenie zamiast tworzyć duplikat.
    const { data, error } = await supabase
      .from('signup_requests')
      .upsert(rows, { onConflict: 'event_id,controller_id,priority' })
      .select();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
