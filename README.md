# Polish VACC — Events

System zapisów i rozpisywania obsady na eventy Polish VACC (VATSIM).
Kontrolerzy przeglądają wydarzenia i zapisują się na stanowiska, administrator
rozpisuje obsadę, a bot na Discordzie ogłasza eventy, przypomina o nich i
publikuje gotowe rozpiski.

## Stos

- **Next.js** (Pages Router) — front i API w jednym projekcie, wdrażane na Vercel.
- **Supabase (Postgres)** — odczyt kluczem `anon` prosto z przeglądarki (RLS
  ogranicza do SELECT), zapis wyłącznie z `pages/api/**` kluczem `service_role`.
- **PL-VACC API** (`cv.plvacc.pl`) — synchronizacja rostera i eksport bookingów.
- **Discord** — webhooki + cron, bez osobnego procesu bota.

Sekrety żyją tylko w zmiennych środowiskowych serwera, więc **repozytorium
może być publiczne**.

## Strony

| Ścieżka | Co robi |
|---|---|
| `/` | najbliższy event z odliczaniem, zegar Zulu, lista zaplanowanych |
| `/events` | lista wydarzeń, tworzenie i edycja (admin), ogłoszenie na Discorda |
| `/events/[id]` | zapisy kontrolerów + rozpisywanie obsady, Gantt, eksport bookingów, wysyłka rozpiski |
| `/events/[id]/stats` | statystyki eventu: kto gdzie i ile kontrolował |
| `/stats` | podsumowanie dowolnego okresu + wysyłka na Discorda (admin) |
| `/top-controllers` | ranking wg czasu z zakończonych eventów |
| `/roster`, `/positions` | roster z synchronizacją PL-VACC, 92 pozycje ATC (admin) |
| `/discord` | status integracji, kolejka materiałów, dziennik wysyłek (admin) |

**Tryb administratora** (ikonka kłódki w górnym pasku) to jedno wspólne hasło
`ADMIN_PANEL_PASSWORD`, nie system kont. Chroni zapisowe endpointy po stronie
serwera (`lib/adminAuth.js`), nie tylko ukrywa przyciski. Bez zalogowania
kontrolerzy podpisani są wyłącznie CID-em (`lib/identity.js`).

## Uruchomienie

```bash
npm install
cp .env.example .env.local   # i uzupełnij wartości
npm run dev                  # http://localhost:3000
```

Wszystkie zmienne środowiskowe są opisane w `.env.example`. Minimum do
działania: `SUPABASE_SECRET_KEY`, `ADMIN_PANEL_PASSWORD`, `PLVACC_API_TOKEN`.

## Wdrożenie i crony

Na Vercel: **Add New → Project** → to repo → wklej te same zmienne co w
`.env.local` → Deploy. `vercel.json` konfiguruje dwa crony:

- `/api/cron/roster` — 22:00 UTC, synchronizacja rostera z PL-VACC,
- `/api/cron/discord` — 18:00 UTC, ogłoszenia, przypomnienia, rozpiski,
  materiały i podsumowanie miesiąca.

Plan Hobby odpala crony raz na dobę. Jeśli materiały mają wychodzić co do
godziny, zmień harmonogram na `0 * * * *` (plan Pro) albo ustaw zewnętrzny
pinger na `/api/cron/discord?secret=<CRON_SECRET>`.

## Discord

Wystarczy webhook kanału (`DISCORD_WEBHOOK_URL`) i opcjonalnie ID roli do
pingowania (`DISCORD_ROLE_ID`). Bot ogłasza nowe eventy, przypomina 5, 2 i 1
dzień przed, publikuje rozpiskę z wykresem obsady, wysyła zaplanowane
materiały i podsumowania. Reguły czasowe zmienisz zmiennymi
`DISCORD_*` z `.env.example`, a stan integracji sprawdzisz na `/discord`.

Każda wysyłka zapisuje się w tabeli `discord_posts` z unikalnym kluczem, więc
nic nie poleci dwa razy — nawet jeśli cron odpali się wielokrotnie.

## Bezpieczeństwo

- Sekrety (token PL-VACC, klucz `service_role`, `CRON_SECRET`, hasło admina,
  URL-e webhooków) wyłącznie w `.env.local` lub w zmiennych na Vercel.
- Klucz `anon` Supabase w `lib/supabaseClient.js` jest jawny celowo — chroni
  go RLS.
- `/api/signups` jest publiczny (to jedyna akcja zapisowa dla kontrolerów);
  reszta zapisowych endpointów wymaga nagłówka `x-admin-password`.
- Endpointy cron przyjmują `CRON_SECRET` w nagłówku `Authorization` albo w
  `?secret=`.
