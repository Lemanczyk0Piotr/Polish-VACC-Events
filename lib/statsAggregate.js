// Wspólne liczenie statystyk z tabeli event_assignments — używane przez
// stronę statystyk pojedynczego eventu (/events/[id]/stats), podsumowanie
// okresu (/stats) ORAZ przez wysyłkę podsumowania na Discorda
// (lib/discordDispatch.js). Jedno miejsce, więc liczby na stronie i te na
// Discordzie nie mogą się rozjechać.
//
// Plik jest izomorficzny (czysty JS, bez DOM i bez Supabase) — działa tak samo
// w przeglądarce i na serwerze.

export const TYPE_ORDER = ['CTR', 'APP', 'TWR', 'GND', 'DEL'];

// Czas zmiany: `session_minutes` z bazy, a gdy go brak — policzony z godzin.
// Import z Base44 miał wiersze bez godzin, a nowsze wiersze bez minut nie
// powinny się zdarzać (API je wylicza), ale obie ścieżki są tanie.
export function minutesOf(assignment) {
  if (assignment?.session_minutes) return Number(assignment.session_minutes) || 0;
  if (assignment?.time_start && assignment?.time_end) {
    const diff = new Date(assignment.time_end).getTime() - new Date(assignment.time_start).getTime();
    return diff > 0 ? Math.round(diff / 60000) : 0;
  }
  return 0;
}

export function fmtDuration(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Etykieta kontrolera: imię i nazwisko, a po nim CID — tak jak poprosił
// user. Gdy brakuje nazwiska, zostaje sam CID.
export function controllerLabel(c) {
  if (!c) return '—';
  const name = c.name || c.controller_name;
  const cid = c.cid || c.controller_cid;
  if (name && cid) return `${name} · ${cid}`;
  return name || (cid ? String(cid) : '—');
}

function hhmm(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// `assignments` to wiersze event_assignments z dołączonymi relacjami
// (controllers, positions i — dla podsumowania okresu — events).
// `eventsById` jest opcjonalne: pozwala policzyć statystyki eventów, które w
// danym okresie nie mają ani jednego przypisania (a i tak powinny być na
// liście, bo się odbyły).
export function aggregateStats(assignments, eventsById = null) {
  const byController = new Map();
  const byPosition = new Map();
  const byType = new Map();
  const byEvent = new Map();
  let totalMinutes = 0;
  let shiftCount = 0;

  for (const a of assignments || []) {
    const minutes = minutesOf(a);
    const eventId = a.event_id || a.events?.id;
    totalMinutes += minutes;
    shiftCount += 1;

    // --- kontroler ---
    const c = a.controllers;
    if (c) {
      const key = c.id || c.cid || c.name;
      if (!byController.has(key)) {
        byController.set(key, {
          id: c.id || key,
          name: c.name || null,
          cid: c.cid || null,
          rating: c.rating || null,
          minutes: 0,
          shifts: 0,
          positions: new Set(),
          events: new Set(),
        });
      }
      const entry = byController.get(key);
      entry.minutes += minutes;
      entry.shifts += 1;
      if (a.positions?.callsign) entry.positions.add(a.positions.callsign);
      if (eventId) entry.events.add(eventId);
    }

    // --- pozycja ---
    const p = a.positions;
    if (p?.callsign) {
      if (!byPosition.has(p.callsign)) {
        byPosition.set(p.callsign, {
          callsign: p.callsign,
          type: p.type || null,
          minutes: 0,
          shifts: 0,
          controllers: new Set(),
          events: new Set(),
        });
      }
      const entry = byPosition.get(p.callsign);
      entry.minutes += minutes;
      entry.shifts += 1;
      if (c) entry.controllers.add(c.id || c.cid || c.name);
      if (eventId) entry.events.add(eventId);

      const type = p.type || 'INNE';
      if (!byType.has(type)) byType.set(type, { type, minutes: 0, positions: new Set(), shifts: 0 });
      const typeEntry = byType.get(type);
      typeEntry.minutes += minutes;
      typeEntry.shifts += 1;
      typeEntry.positions.add(p.callsign);
    }

    // --- event ---
    if (eventId) {
      if (!byEvent.has(eventId)) {
        const meta = eventsById?.get?.(eventId) || a.events || {};
        byEvent.set(eventId, {
          id: eventId,
          title: meta.title || '—',
          event_date: meta.event_date || null,
          time_start: meta.time_start || null,
          time_end: meta.time_end || null,
          kind: meta.kind || 'event',
          status: meta.status || null,
          minutes: 0,
          shifts: 0,
          controllers: new Set(),
          positions: new Set(),
        });
      }
      const entry = byEvent.get(eventId);
      entry.minutes += minutes;
      entry.shifts += 1;
      if (c) entry.controllers.add(c.id || c.cid || c.name);
      if (p?.callsign) entry.positions.add(p.callsign);
    }
  }

  // Eventy bez ani jednego przypisania też trafiają na listę — "nikt nie
  // kontrolował" to również informacja, a milcząco pominięty event wyglądałby
  // jak błąd danych.
  if (eventsById) {
    for (const [id, meta] of eventsById.entries()) {
      if (byEvent.has(id)) continue;
      byEvent.set(id, {
        id,
        title: meta.title || '—',
        event_date: meta.event_date || null,
        time_start: meta.time_start || null,
        time_end: meta.time_end || null,
        kind: meta.kind || 'event',
        status: meta.status || null,
        minutes: 0,
        shifts: 0,
        controllers: new Set(),
        positions: new Set(),
      });
    }
  }

  const controllers = Array.from(byController.values())
    .map((c) => ({ ...c, positions: Array.from(c.positions).sort(), eventCount: c.events.size }))
    .sort((a, b) => b.minutes - a.minutes || a.name?.localeCompare?.(b.name || '') || 0);

  const positions = Array.from(byPosition.values())
    .map((p) => ({ ...p, controllerCount: p.controllers.size, eventCount: p.events.size }))
    .sort((a, b) => b.minutes - a.minutes || a.callsign.localeCompare(b.callsign));

  const types = TYPE_ORDER.concat(Array.from(byType.keys()).filter((t) => !TYPE_ORDER.includes(t)))
    .map((type) => byType.get(type))
    .filter(Boolean)
    .map((t) => ({ ...t, positionCount: t.positions.size }));

  const events = Array.from(byEvent.values())
    .map((e) => ({
      ...e,
      controllerCount: e.controllers.size,
      positionCount: e.positions.size,
      hours: e.time_start ? `${e.time_start.slice(0, 5)}–${(e.time_end || '').slice(0, 5)}` : null,
    }))
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));

  return {
    totalMinutes,
    shiftCount,
    controllers,
    positions,
    types,
    events,
    controllerCount: controllers.length,
    positionCount: positions.length,
    eventCount: events.length,
    // Średni czas na kontrolera — sensowna miara "ile ktoś typowo siedzi",
    // liczona tylko po kontrolerach, którzy faktycznie coś kontrolowali.
    avgMinutesPerController: controllers.length ? Math.round(totalMinutes / controllers.length) : 0,
  };
}

// Zmiany na jednej pozycji, posortowane — do tabeli "kto, gdzie, od kiedy do
// kiedy" na stronie statystyk eventu.
export function shiftsByPosition(assignments) {
  const map = new Map();
  for (const a of assignments || []) {
    const callsign = a.positions?.callsign || '???';
    if (!map.has(callsign)) map.set(callsign, { callsign, type: a.positions?.type, items: [] });
    map.get(callsign).items.push({
      id: a.id,
      from: hhmm(a.time_start),
      to: hhmm(a.time_end),
      minutes: minutesOf(a),
      controller: a.controllers || null,
      student: a.student || null,
    });
  }
  return Array.from(map.values())
    .map((p) => {
      p.items.sort((x, y) => String(x.from).localeCompare(String(y.from)));
      p.minutes = p.items.reduce((acc, i) => acc + i.minutes, 0);
      return p;
    })
    .sort((a, b) => a.callsign.localeCompare(b.callsign));
}
