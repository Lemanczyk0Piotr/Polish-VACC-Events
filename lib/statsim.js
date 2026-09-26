// Ruch lotniczy w oknie eventu, pobierany ze Statsim (api.statsim.net).
//
// Po co: rozpiska mówi, kto MIAŁ siedzieć, a Statsim mówi, co się wtedy
// faktycznie działo na sieci — ile było startów i lądowań, skąd i dokąd
// latali, czym. To jedyne dane w tej aplikacji, których nie wpisuje człowiek.
//
// Klucz API (`STATSIM_API_KEY`) jest sekretem serwera — cała komunikacja
// odbywa się w pages/api/**, nigdy w przeglądarce. Bez klucza API zwraca 401.
//
// Zapytania idą po ZAKRESIE DAT i kodzie ICAO lotniska, nie po linku, który
// admin wkleja w polu `statsim_url` przy evencie — ten zostaje zwykłym
// odnośnikiem dla ludzi.
//
// Lotniska bierzemy z pola `events.statsim_airports` (lista kodów ICAO po
// przecinku) — dokładnie tak, jak działa „Custom event" na statsim.net: From,
// To i „ICAO codes (comma separated)". Obsada pozycji NIE decyduje: lotnisko
// eventowe bez obsady liczymy, a obsadzona pozycja poza lotniskami eventu nie.
// Gdy pole jest puste, wracamy do starego zachowania (lotniska z callsignów
// obsadzonych pozycji), żeby event bez wpisanych lotnisk nie został bez danych.

const BASE = 'https://api.statsim.net';

// Lotniska liczymy z callsignów pozycji obsadzonych na evencie: EPWA_TWR ->
// EPWA, EPWW_CTR -> EPWW. Sektory obszarowe (EPWW) nie są lotniskiem, więc
// odpadają niżej — zostaje tylko to, co wygląda na port lotniczy.
const AREA_CALLSIGN_PREFIXES = ['EPWW'];

export function airportsFromCallsigns(callsigns) {
  const out = new Set();
  for (const cs of callsigns || []) {
    const raw = String(cs || '').trim().toUpperCase();
    // Callsign pozycji zawsze ma podkreślnik (EPWA_TWR, EPKK_APP). Sam ciąg
    // czteroliterowy bez niego to nie lotnisko — np. "ATIS" wyglądałby jak
    // poprawny kod ICAO i przeszedłby dalej.
    if (!raw.includes('_')) continue;
    const icao = raw.split('_')[0];
    if (!/^[A-Z]{4}$/.test(icao)) continue;
    if (AREA_CALLSIGN_PREFIXES.includes(icao)) continue;
    out.add(icao);
  }
  return Array.from(out).sort();
}

// Lista lotnisk wpisana ręcznie: "EPWA, EPKK", "epwa epkk", "EPWA;EPKK" —
// wszystko jedno, byle dały się wyłuskać czteroliterowe kody ICAO. Sektory
// obszarowe (EPWW) NIE są tu odfiltrowywane: jeśli admin świadomie je wpisał,
// to jego decyzja — inaczej niż przy zgadywaniu z callsignów.
export function parseAirportList(value) {
  const out = new Set();
  for (const part of String(value || '').split(/[^A-Za-z0-9]+/)) {
    const icao = part.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(icao)) out.add(icao);
  }
  return Array.from(out).sort();
}

function parseTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Okno eventu w UTC. Domyślnie DOKŁADNIE godziny eventu, bez marginesu
// (prośba admina — tak samo jak „From"/„To" w Custom event na statsim.net).
// `padMinutes` zostaje jako parametr, gdyby kiedyś miał wrócić margines.
export function eventWindow(event, padMinutes = 0) {
  if (!event?.event_date || !event.time_start) return null;
  const startStr = String(event.time_start).slice(0, 8).padEnd(8, ':00');
  const endStr = String(event.time_end || event.time_start).slice(0, 8).padEnd(8, ':00');
  const from = new Date(`${event.event_date}T${startStr}Z`);
  let to = new Date(`${event.event_date}T${endStr}Z`);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  // Event przez północ (np. 21:00-01:00) — koniec jest następnego dnia.
  if (to <= from) to = new Date(to.getTime() + 24 * 3600 * 1000);
  return {
    from: new Date(from.getTime() - padMinutes * 60000),
    to: new Date(to.getTime() + padMinutes * 60000),
  };
}

async function statsimGet(path, params, apiKey) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Statsim ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

/**
 * Zwraca policzone statystyki ruchu dla jednego eventu:
 *
 *   {
 *     window: { from, to },
 *     airport_source: 'event' | 'staffing',
 *     airports: [{ icao, departures, arrivals, total }],
 *     routes:   [{ route, count }],
 *     aircraft: [{ type, count }],
 *     totals:   { movements, flights, departures, arrivals },
 *   }
 *
 * Jeden strzał do API na lotnisko (`/api/Flights/Icao`), a podział na starty i
 * lądowania robimy sami z pól `departure`/`destination` — inaczej trzeba by
 * dwóch zapytań na lotnisko (`IcaoOrigin` + `IcaoDestination`).
 */
export async function fetchEventTraffic(event, callsigns, { apiKey = process.env.STATSIM_API_KEY } = {}) {
  if (!apiKey) throw new Error('Brak STATSIM_API_KEY w zmiennych środowiskowych serwera.');
  const window = eventWindow(event);
  if (!window) throw new Error('Wydarzenie nie ma ustawionej daty i godzin.');

  // Wpisane lotniska eventu mają pierwszeństwo nad zgadywaniem z obsady.
  const declared = parseAirportList(event?.statsim_airports);
  const airports = declared.length > 0 ? declared : airportsFromCallsigns(callsigns);
  const airportSource = declared.length > 0 ? 'event' : 'staffing';

  if (airports.length === 0) {
    return {
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      airport_source: airportSource,
      airports: [],
      routes: [],
      aircraft: [],
      totals: { movements: 0, flights: 0, departures: 0, arrivals: 0 },
      note: 'no-airports',
    };
  }

  const params = { from: window.from.toISOString(), to: window.to.toISOString() };
  const perAirport = [];
  const seenFlights = new Map();

  for (const icao of airports) {
    const flights = await statsimGet('/api/Flights/Icao', { ...params, icao }, apiKey);
    let departures = 0;
    let arrivals = 0;

    for (const f of Array.isArray(flights) ? flights : []) {
      const dep = String(f.departure || '').toUpperCase();
      const dest = String(f.destination || '').toUpperCase();
      // Liczymy tylko ruch, który MIEŚCI SIĘ w oknie eventu — API filtruje po
      // swoim polu czasu, a nas interesuje moment startu/lądowania.
      const departed = parseTime(f.departed);
      const arrived = parseTime(f.arrived);
      const inWindow = (d) => d && d >= window.from && d <= window.to;

      const departedHere = dep === icao && inWindow(departed);
      const arrivedHere = dest === icao && inWindow(arrived);
      if (departedHere) departures += 1;
      if (arrivedHere) arrivals += 1;

      // Ten sam lot wychodzi w odpowiedzi dwóch lotnisk (start z jednego,
      // lądowanie na drugim) — do tras i typów maszyn liczymy go raz.
      //
      // Warunek jest celowo taki sam jak dla operacji: do statystyk wchodzi
      // wyłącznie lot, który w godzinach eventu wystartował albo wylądował NA
      // LOTNISKU EVENTU. Wcześniej wystarczyło, że lot miał jakikolwiek czas w
      // oknie — wtedy start z EPWA o 17:45 wchodził do tras przez samo
      // lądowanie o 19:30 na lotnisku, które eventu nie dotyczy.
      if ((departedHere || arrivedHere) && f.id != null) seenFlights.set(f.id, f);
    }

    perAirport.push({ icao, departures, arrivals, total: departures + arrivals });
  }

  const routeCounts = new Map();
  const aircraftCounts = new Map();
  for (const f of seenFlights.values()) {
    const dep = String(f.departure || '').toUpperCase();
    const dest = String(f.destination || '').toUpperCase();
    if (dep && dest) {
      const key = `${dep} → ${dest}`;
      routeCounts.set(key, (routeCounts.get(key) || 0) + 1);
    }
    const type = String(f.aircraft || '').toUpperCase().trim();
    if (type) aircraftCounts.set(type, (aircraftCounts.get(type) || 0) + 1);
  }

  const sortDesc = (map, keyName) =>
    Array.from(map.entries())
      .map(([k, count]) => ({ [keyName]: k, count }))
      .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));

  perAirport.sort((a, b) => b.total - a.total || a.icao.localeCompare(b.icao));

  return {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    airport_source: airportSource,
    airports: perAirport,
    routes: sortDesc(routeCounts, 'route').slice(0, 15),
    aircraft: sortDesc(aircraftCounts, 'type').slice(0, 10),
    totals: {
      movements: perAirport.reduce((acc, a) => acc + a.total, 0),
      flights: seenFlights.size,
      departures: perAirport.reduce((acc, a) => acc + a.departures, 0),
      arrivals: perAirport.reduce((acc, a) => acc + a.arrivals, 0),
    },
  };
}
