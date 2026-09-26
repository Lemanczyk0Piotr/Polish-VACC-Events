import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { isAdminRequest } from '../../../lib/adminAuth';
import { fetchEventTraffic } from '../../../lib/statsim';

// Statystyki ruchu lotniczego dla jednego eventu, ze Statsim.
//
// Endpoint jest PUBLICZNY (strona statystyk eventu też jest), ale klucz API
// nigdy nie opuszcza serwera — przeglądarka dostaje wyłącznie policzone już
// agregaty.
//
// Zwykłe GET czyta WYŁĄCZNIE pamięć podręczną (tabela `event_traffic`) i nigdy
// nie dzwoni do Statsim. Pobranie z zewnątrz odpala się dopiero na
// `?import=1` z hasłem administratora — czyli po kliknięciu przycisku na
// stronie statystyk.
//
// Dlaczego tak, a nie automatycznie przy wejściu: klucz API jest wspólny dla
// całej strony, limitów Statsim nie znamy, a jedno wejście na stronę to jedno
// zapytanie na KAŻDE obsadzone lotnisko. Przy automacie wystarczyłby jeden
// link wrzucony na Discorda, żeby nas przez te limity przepchnąć.

export default async function handler(req, res) {
  const { id, import: doImport } = req.query;
  if (!id) return res.status(400).json({ error: 'Brak id' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Kliknięcie „IMPORTUJ" z nieważnym hasłem MUSI dostać 401, a nie ciche
  // zejście do trybu „czytaj pamięć podręczną" — inaczej przycisk wygląda,
  // jakby nic nie robił (dokładnie tak to zgłosił admin).
  if (doImport === '1' && !isAdminRequest(req)) {
    return res.status(401).json({ error: 'Nieprawidłowe hasło administratora.' });
  }
  const wantsImport = doImport === '1';

  try {
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('id, title, event_date, time_start, time_end, status, statsim_airports')
      .eq('id', id)
      .single();
    if (eventErr) throw new Error(eventErr.message);

    const { data: cached } = await supabase
      .from('event_traffic')
      .select('data, fetched_at')
      .eq('event_id', id)
      .maybeSingle();

    if (!wantsImport) {
      // Sam podgląd strony: oddajemy to, co już zaimportowano, albo mówimy
      // wprost, że jeszcze nic nie ma.
      if (cached) return res.status(200).json({ ...cached.data, cached: true, fetched_at: cached.fetched_at });
      return res.status(200).json({ missing: true, can_import: Boolean(process.env.STATSIM_API_KEY) });
    }

    if (!process.env.STATSIM_API_KEY) {
      // Brak klucza to stan konfiguracji, nie awaria — strona ma o tym
      // napisać wprost, zamiast pokazywać pustą sekcję albo błąd.
      return res.status(200).json({ unavailable: 'no-api-key' });
    }

    // Lotniska eventu wpisuje admin w polu `statsim_airports` — to one
    // decydują, obsadzone czy nie. Callsigny obsadzonych pozycji czytamy tylko
    // jako zapas dla eventów, przy których nikt tego pola nie wypełnił.
    let callsigns = [];
    if (!event?.statsim_airports) {
      const { data: rows, error: rowsErr } = await supabase
        .from('event_assignments')
        .select('positions(callsign)')
        .eq('event_id', id);
      if (rowsErr) throw new Error(rowsErr.message);
      callsigns = (rows || []).map((r) => r.positions?.callsign).filter(Boolean);
    }

    // `staffed` wraca do przeglądarki, żeby dało się odróżnić „Statsim nie
    // widział ruchu" od „nie ma z czego liczyć" (brak wpisanych lotnisk i brak
    // obsady) — bez tego oba stany wyglądają jak puste zero.
    const traffic = { ...(await fetchEventTraffic(event, callsigns)), staffed: callsigns.length };

    await supabase
      .from('event_traffic')
      .upsert({ event_id: id, data: traffic, fetched_at: new Date().toISOString() }, { onConflict: 'event_id' });

    return res.status(200).json({ ...traffic, cached: false, fetched_at: new Date().toISOString() });
  } catch (err) {
    // Statsim leży albo klucz jest zły — jeśli mamy cokolwiek w pamięci
    // podręcznej, lepiej pokazać nieświeże dane niż nic.
    const { data: cached } = await supabase
      .from('event_traffic')
      .select('data, fetched_at')
      .eq('event_id', id)
      .maybeSingle();
    if (cached) {
      return res.status(200).json({ ...cached.data, cached: true, stale: true, fetched_at: cached.fetched_at, error: err.message });
    }
    return res.status(502).json({ error: err.message });
  }
}
