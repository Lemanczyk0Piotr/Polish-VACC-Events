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

  // Tworzenie nowych zgłoszeń wyłączone (2026-09-03, na prośbę admina) —
  // funkcja zapisów nie jest potrzebna na obecnym etapie rozwoju aplikacji.
  // UI (pages/events/[id].js) nie pokazuje już formularza, ale endpoint był
  // publiczny (bez hasła admina), więc blokujemy go też tutaj — inaczej dałoby
  // się nadal wysłać zgłoszenie bezpośrednim żądaniem z pominięciem strony.
  // Historyczne dane w `signup_requests` (sprzed wyłączenia) zostają
  // nietknięte i nadal są czytane na stronach statystyk.
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(410).json({ error: 'Zapisy na eventy są obecnie wyłączone.' });
}
