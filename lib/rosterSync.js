import { getSupabaseAdmin } from './supabaseAdmin';

const RATING_MAP = {
  0: 'SUS',
  1: 'OBS',
  2: 'S1',
  3: 'S2',
  4: 'S3',
  5: 'C1',
  6: 'C2',
  7: 'C3',
  8: 'I1',
  9: 'I2',
  10: 'I3',
  11: 'SUP',
  12: 'ADM',
};

/**
 * Ciągnie pełny roster PLVACC z zewnętrznego API (cv.plvacc.pl) i zapisuje
 * bezpieczne pola (imię/nazwisko, CID, rating, status) do Supabase.
 * Token PL-VACC i klucz Supabase service_role są czytane wyłącznie ze
 * zmiennych środowiskowych serwera — nigdy nie opuszczają tej funkcji.
 * Dane wrażliwe z API (tokeny OAuth, e-maile) są celowo odrzucane i nigdy
 * nie trafiają do bazy.
 */
export async function runRosterSync() {
  const token = process.env.PLVACC_API_TOKEN;
  if (!token) {
    throw new Error('Brak PLVACC_API_TOKEN w zmiennych środowiskowych serwera');
  }

  const res = await fetch(`https://cv.plvacc.pl/api/user_info?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    throw new Error(`PLVACC API zwróciło błąd: ${res.status}`);
  }
  const payload = await res.json();
  const records = Array.isArray(payload) ? payload : payload.value || [];

  const rostered = records.filter((r) => r.is_rostered === 1);

  const safe = rostered.map((r) => ({
    name: `${r.name || ''} ${r.surname || ''}`.trim(),
    cid: String(r.vid),
    rating: RATING_MAP[r.rating] ?? String(r.rating ?? ''),
    status: r.subdivision === 'POL' ? 'active' : 'visitor',
  }));

  const supabase = getSupabaseAdmin();

  // Upsert po CID — jeśli kontroler już istnieje (dopasowany po CID), update;
  // jeśli nie, nowy wiersz. Dla kontrolerów bez CID w bazie (historyczni,
  // sprzed synchronizacji) to nie nadpisze niczego, bo dopasowanie jest po cid.
  const { error } = await supabase
    .from('controllers')
    .upsert(safe, { onConflict: 'cid' });

  if (error) {
    throw new Error(`Błąd zapisu do Supabase: ${error.message}`);
  }

  return { synced: safe.length, at: new Date().toISOString() };
}
