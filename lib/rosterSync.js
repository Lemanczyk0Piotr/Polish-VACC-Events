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

// PLVACC's `is_rostered` isn't a plain boolean — confirmed against a live API
// dump (2026-08-27): it's 1 (fully rostered), 0 (not rostered), or -1, which
// shows up paired with `roster_message: 10` and a near-future `rostered_until`
// — this is PLVACC's own "activity check due soon" warning state (their UI
// shows it as a checkmark plus "Inactive (<that date>)"). Treating -1 the
// same as 0 would immediately undo the "stale controller -> inactive" fix,
// flagging someone as dropped the moment they're merely warned. Both 1 and -1
// count as still-on-the-roster for our purposes; only 0 (or missing from the
// response entirely) means actually removed.
const STILL_ROSTERED = new Set([1, -1]);

// Endorsementy siedzą w OSOBNYM endpoincie (`endorsement_info`) — w
// `user_info` nie ma po nich śladu, dlatego przez długi czas w ogóle się nie
// synchronizowały i trzeba je było wpisywać ręcznie w Rosterze.
//
// Nazwy bierzemy żywcem z PLVACC (S2-PE, S2-ME, S3-ME, C1-ME) — decyzja
// usera z 2026-09-18. Wcześniej w bazie były własne etykiety (PE, S2-CE,
// S3-CE, C1-CE); migracja `rename_endorsements_to_plvacc_names` przepisała
// je na nazwy PLVACC, żeby jedno i drugie się nie mieszało.
//
// SOLO pomijamy: to czasowa walidacja na jedną pozycję, a nie uprawnienie,
// które ma sens jako stała plakietka przy nazwisku.
const SKIP_ENDORSEMENT_SUFFIX = '-SOLO';

function parsePlvaccDate(value) {
  // "YYYY-MM-DD HH:MM:SS" bez strefy — tak jak `rostered_until` w user_info,
  // traktujemy jako UTC zamiast zostawiać JS-owi zgadywanie.
  if (!value || typeof value !== 'string') return null;
  const d = new Date(`${value.replace(' ', 'T')}Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Pobiera endorsementy z PLVACC i zwraca mapę `CID -> ['S2-PE', 'C1-ME', ...]`.
 *
 * Zwraca `null`, gdy zapytanie się nie powiedzie — wtedy wywołujący MUSI
 * pominąć kolumnę `endorsements` w zapisie. Wpisanie pustej listy przy błędzie
 * API skasowałoby wszystkim uprawnienia przy jednym nieudanym syncu.
 *
 * ŚWIADOMIE NIE filtrujemy po `endorsment_until`, mimo że nazwa sugeruje datę
 * ważności. W danych PLVACC to pole dla wpisów PE jest ustawione ~2 godziny
 * PRZED ich własnym `updated_at` (czyli w przeszłości już w chwili nadania),
 * więc filtr po nim skasowałby PE praktycznie wszystkim — dokładnie to, czego
 * brak user zgłosił. Do czasu wyjaśnienia, co to pole naprawdę znaczy,
 * traktujemy je jako informacyjne.
 */
export async function fetchEndorsements(token) {
  try {
    const res = await fetch(
      `https://cv.plvacc.pl/api/endorsement_info?token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return null;
    const payload = await res.json();
    const records = Array.isArray(payload) ? payload : payload.value || [];
    if (!Array.isArray(records)) return null;

    const now = Date.now();
    const byCid = new Map();
    for (const r of records) {
      const type = String(r.type || '').trim();
      const cid = String(r.pid || '').trim();
      if (!type || !cid) continue;
      if (type.endsWith(SKIP_ENDORSEMENT_SUFFIX)) continue;

      // `endorsment_blocked` = "1970-01-01 00:00:00" oznacza "nie zablokowane".
      // Realna data w PRZYSZŁOŚCI to aktywna blokada; data w przeszłości to
      // blokada, która już minęła.
      const blockedUntil = parsePlvaccDate(r.endorsment_blocked);
      if (blockedUntil && blockedUntil.getTime() > now) continue;

      if (!byCid.has(cid)) byCid.set(cid, new Set());
      byCid.get(cid).add(type);
    }

    // Pusty wynik traktujemy jak awarię, nie jak "nikt nie ma uprawnień".
    // PLVACC zawsze ma kilkadziesiąt endorsementów, więc zero oznacza raczej
    // zmieniony kontrakt API albo pustą odpowiedź — a zapisanie tego skasowałoby
    // uprawnienia całemu rosterowi jednym kliknięciem.
    if (byCid.size === 0) return null;

    const out = new Map();
    for (const [cid, types] of byCid.entries()) out.set(cid, Array.from(types).sort());
    return out;
  } catch (err) {
    return null;
  }
}

/**
 * Ciągnie pełny roster PLVACC z zewnętrznego API (cv.plvacc.pl) i zapisuje
 * bezpieczne pola (imię/nazwisko, CID, rating, status, roster_until) do
 * Supabase. Token PL-VACC i klucz Supabase service_role są czytane wyłącznie
 * ze zmiennych środowiskowych serwera — nigdy nie opuszczają tej funkcji.
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

  const rostered = records.filter((r) => STILL_ROSTERED.has(r.is_rostered));

  // Drugie zapytanie, do osobnego endpointu. `null` = nie udało się pobrać —
  // wtedy niżej w ogóle nie dotykamy kolumny `endorsements`.
  const endorsementsByCid = await fetchEndorsements(token);

  const safe = rostered.map((r) => ({
    name: `${r.name || ''} ${r.surname || ''}`.trim(),
    cid: String(r.vid),
    rating: RATING_MAP[r.rating] ?? String(r.rating ?? ''),
    status: r.subdivision === 'POL' ? 'active' : 'visitor',
    // "YYYY-MM-DD HH:MM:SS" from PLVACC, no offset — their other UTC-derived
    // timestamps in this same payload (created_at/updated_at) are in ISO8601
    // with a trailing Z, so treated as UTC here too rather than left for JS
    // to guess (which would parse it as local time).
    roster_until: r.rostered_until ? `${r.rostered_until.replace(' ', 'T')}Z` : null,
    // Kolumna dokładana tylko wtedy, gdy endpoint endorsementów odpowiedział.
    // Pusta tablica jest tu poprawną wartością: znaczy "ten kontroler nie ma
    // już żadnych uprawnień", więc cofnięcie uprawnienia w PLVACC propaguje
    // się do nas. Ale przy błędzie API klucza nie ma w ogóle, więc Supabase
    // zostawia to, co było.
    ...(endorsementsByCid ? { endorsements: endorsementsByCid.get(String(r.vid)) || [] } : {}),
  }));

  if (safe.length === 0) {
    // PLVACC API returned nothing usable — bail out instead of marking every
    // controller in the database inactive on what's almost certainly a
    // transient/empty response.
    throw new Error('PLVACC API nie zwróciło żadnych kontrolerów z rosteru — przerwano synchronizację.');
  }

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

  // The upsert above only ever ADDS/updates controllers that are CURRENTLY
  // rostered — a controller who dropped off the PLVACC roster simply isn't
  // in `safe` any more, so without this step their row (and status) is never
  // touched again and they stay "active" forever. Find anyone previously
  // synced (has a cid) whose cid is no longer in this fetch and flip them to
  // inactive.
  const rosteredCids = new Set(safe.map((r) => r.cid));

  const { data: existing, error: fetchErr } = await supabase
    .from('controllers')
    .select('id, cid, status')
    .not('cid', 'is', null)
    .neq('status', 'inactive');

  if (fetchErr) {
    throw new Error(`Błąd odczytu z Supabase: ${fetchErr.message}`);
  }

  const staleIds = (existing || []).filter((c) => !rosteredCids.has(c.cid)).map((c) => c.id);

  if (staleIds.length > 0) {
    const { error: deactivateErr } = await supabase
      .from('controllers')
      // Clear roster_until too — otherwise a stale "active until <date>"
      // from before they dropped off would keep showing on an inactive row.
      .update({ status: 'inactive', roster_until: null })
      .in('id', staleIds);

    if (deactivateErr) {
      throw new Error(`Błąd dezaktywacji kontrolerów w Supabase: ${deactivateErr.message}`);
    }
  }

  return {
    synced: safe.length,
    deactivated: staleIds.length,
    // `null` odróżnia "endpoint endorsementów nie odpowiedział" od "odpowiedział
    // i nikt nie ma uprawnień" — UI pokazuje wtedy ostrzeżenie zamiast zera.
    endorsed: endorsementsByCid ? safe.filter((r) => (r.endorsements || []).length > 0).length : null,
    at: new Date().toISOString(),
  };
}
