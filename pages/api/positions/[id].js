import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';

// Przełączanie widoczności pozycji przy rozpisywaniu obsady
// (`positions.visible`). Pozycja ukryta znika z Schedulera i z listy wyboru w
// formularzu zapisu, ale na stronie /positions zostaje zawsze — to katalog
// wszystkich pozycji ATC, nie lista aktualnie używanych.
export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Brak id' });

  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    res.setHeader('Allow', ['PUT', 'PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body || {};
  if (!('visible' in body)) {
    return res.status(400).json({ error: 'Nie ma czego zmienić (oczekiwano pola visible).' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('positions')
      .update({ visible: Boolean(body.visible) })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
