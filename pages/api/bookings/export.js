// Eksport bookingów na CoreVACC (cv.plvacc.pl) dla eventu — dla KAŻDEJ pozycji,
// która ma choć jednego przypisanego kontrolera na tym evencie (niezależnie od
// tego, w jakich dokładnie godzinach ktoś na niej siedział), tworzy JEDEN
// booking obejmujący PEŁNE godziny eventu. Booking nie jest przypisywany do
// kontrolera, który faktycznie siedział na pozycji — właścicielem bookingu
// jest zawsze konto powiązane z PLVACC_API_TOKEN (patrz PLVACC_BOOKING_OWNER_NAME
// poniżej), zgodnie z wyraźną prośbą admina.
//
// Kontrakt API CoreVACC — pola potwierdzone 2026-09-02 przez podgląd
// prawdziwego zapytania (DevTools Network) jakie wysyła WŁASNY formularz
// CoreVACC pod /addNewBooking (sesja+CSRF, inny route niż /api/booking/new,
// ale te same nazwy pól modelu):
//   [POST] cv.plvacc.pl/api/booking/new
//   wymagane: controller (format "Imię Nazwisko - CID", np. "Karol Rosa -
//             1608875" — UWAGA: publiczna dokumentacja na plvacc.pl/API/
//             błędnie nazywa to pole "name", w rzeczywistości to
//             "controller"), bookingdate ("Y-m-d"), timestart ("HH:MM"),
//             timeend ("HH:MM"), position (np. "EPWA_TWR"),
//             sessionType (1=normal, 2=training, 3=exam, 4=sweatbox)
//   opcjonalne: comment
//   token wymagany na wszystkich endpointach (query string, wzorem
//   lib/rosterSync.js i pages/api/bookings/index.js — dodatkowo powielony w
//   ciele formularza dla pewności).
//
// Historia debugowania (2026-09-02, bo endpoint jest nieudokumentowany
// publicznie): (1) JSON body bez nagłówka Accept — CoreVACC odsyłał całą
// stronę HTML dashboardu zamiast błędu (Laravel domyślnie robi tak, gdy
// request nie deklaruje że chce JSON) → naprawione nagłówkami
// Accept/X-Requested-With. (2) form-urlencoded z polem "name" (zgodnie z
// błędną publiczną dokumentacją) — {"message":"Server Error"} (500) dla
// każdej pozycji, potwierdzone też gołym żądaniem PowerShell bez udziału tej
// apki, więc problem był w samych danych, nie w kliencie. (3) Podejrzenie
// potwierdzone przez podgląd prawdziwego ruchu sieciowego: pole nazywa się
// "controller", nie "name" — stąd serwer dostawał puste/nieistniejące pole i
// wywalał się z generycznym 500 zamiast czytelnego błędu walidacji.
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';

const SESSION_TYPE_NORMAL = 1;

function hhmm(value) {
  if (!value) return null;
  return String(value).slice(0, 5);
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.PLVACC_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Brak skonfigurowanego PLVACC_API_TOKEN na serwerze (patrz .env.local)' });
  }
  const ownerName = process.env.PLVACC_BOOKING_OWNER_NAME;
  if (!ownerName) {
    return res.status(500).json({
      error:
        'Brak skonfigurowanego PLVACC_BOOKING_OWNER_NAME na serwerze — ustaw je na "Imię Nazwisko - CID" właściciela bookingów (patrz .env.local).',
    });
  }

  const { event_id } = req.body || {};
  if (!event_id) return res.status(400).json({ error: 'Brak event_id' });

  const supabase = getSupabaseAdmin();

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, title, event_date, time_start, time_end')
    .eq('id', event_id)
    .single();
  if (eventErr) return res.status(500).json({ error: eventErr.message });
  if (!event.event_date || !event.time_start || !event.time_end) {
    return res.status(400).json({ error: 'Event nie ma ustawionej daty i pełnych godzin.' });
  }

  const { data: assignments, error: assignErr } = await supabase
    .from('event_assignments')
    .select('position_id, is_free, positions(callsign)')
    .eq('event_id', event_id);
  if (assignErr) return res.status(500).json({ error: assignErr.message });

  // Jedna pozycja = jeden booking, bez względu na to ilu kontrolerów / w
  // jakich godzinach na niej siedziało. Wiersze "- - - FREE - - -" (is_free)
  // NIE liczą się jako obsada — to świadomie pusty przedział, więc pozycja,
  // która ma same takie wiersze, nie dostaje bookingu na CoreVACC.
  const positionsByCallsign = new Map();
  for (const a of assignments || []) {
    if (a.is_free) continue;
    const callsign = a.positions?.callsign;
    if (callsign && !positionsByCallsign.has(callsign)) positionsByCallsign.set(callsign, true);
  }
  const callsigns = Array.from(positionsByCallsign.keys()).sort();

  if (callsigns.length === 0) {
    return res.status(200).json({ created: [], failed: [] });
  }

  const bookingdate = event.event_date;
  const timestart = hhmm(event.time_start);
  const timeend = hhmm(event.time_end);

  const created = [];
  const failed = [];

  // Sekwencyjnie, nie równolegle — łatwiej o czytelny log błędów per-pozycja i
  // nie zalewamy zewnętrznego API kilkunastoma równoczesnymi żądaniami.
  for (const callsign of callsigns) {
    const upstreamUrl = new URL('https://cv.plvacc.pl/api/booking/new');
    upstreamUrl.searchParams.set('token', token);

    const form = new URLSearchParams({
      token,
      controller: ownerName,
      bookingdate,
      timestart,
      timeend,
      position: callsign,
      sessionType: String(SESSION_TYPE_NORMAL),
      comment: event.title,
    });

    try {
      const upstreamRes = await fetch(upstreamUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Bez tego Laravel (jeśli to on stoi za CoreVACC) nie widzi że
          // klient chce JSON i przy błędzie (404/422/500/przekierowanie do
          // logowania) odsyła całą stronę HTML dashboardu zamiast czytelnego
          // komunikatu błędu — dokładnie to zaobserwowano przy pierwszym
          // teście (odpowiedź = cały <!doctype html> z "Core • Polish VACC").
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: form.toString(),
      });
      const contentType = upstreamRes.headers.get('content-type') || '';
      let body;
      if (contentType.includes('application/json')) {
        body = await upstreamRes.json();
      } else {
        // Nie JSON — najpewniej dalej strona HTML (auth/routing problem po
        // stronie CoreVACC). Przycinamy, żeby alert() w przeglądarce był
        // czytelny zamiast zalewać ekran całym dokumentem.
        const text = await upstreamRes.text();
        body = `[HTTP ${upstreamRes.status}, non-JSON response] ${text.slice(0, 200).replace(/\s+/g, ' ').trim()}…`;
      }

      if (!upstreamRes.ok) {
        failed.push({ position: callsign, message: typeof body === 'string' ? body : JSON.stringify(body) });
      } else {
        created.push({ position: callsign, message: typeof body === 'string' ? body : JSON.stringify(body) });
      }
    } catch (err) {
      failed.push({ position: callsign, message: err.message || 'Nie udało się połączyć z PLVACC API' });
    }
  }

  return res.status(200).json({ created, failed });
}
