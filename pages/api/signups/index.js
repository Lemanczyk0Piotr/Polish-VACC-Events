import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

// Celowo BEZ requireAdmin — to jedyny zapisowy endpoint dostępny dla zwykłych
// kontrolerów (nie ma jeszcze logowania per-kontroler, więc tożsamość to po
// prostu wybór własnego imienia z listy w formularzu, patrz pages/events/[id].js).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event_id, controller_id, choices, notes } = req.body || {};

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
      status: 'pending',
    }));

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Brak poprawnych preferencji.' });
  }

  try {
    const supabase = getSupabaseAdmin();
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
