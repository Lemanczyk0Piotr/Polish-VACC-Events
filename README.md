# Polish VACC – Zapisy na wydarzenia

Interaktywny system dla kontrolerów Polish VACC (PLVACC) umożliwiający przeglądanie
nadchodzących wydarzeń (eventów) na sieci VATSIM oraz zapisywanie się na stanowiska
kontrolerskie podczas tych wydarzeń. Docelowo migracja z istniejącej aplikacji Base44.

## Status projektu

🚧 W budowie. Zrobione:
- Baza danych (Supabase/Postgres): tabele `controllers`, `positions`, `events`,
  `event_assignments`, RLS włączone (publiczny odczyt).
- Integracja z PL-VACC API (`/api/bookings`) — token ukryty po stronie serwera.
- Strony: **Roster** (lista kontrolerów z bazy, z przyciskiem ręcznej synchronizacji),
  **Positions** (pozycje ATC z bazy).
- Automatyczna synchronizacja rostera z PL-VACC API:
  - przycisk "Sync now" na stronie Roster (`/api/sync/roster`),
  - cron co noc o 22:00 UTC / ~00:00 czasu polskiego (`/api/cron/roster`,
    skonfigurowany w `vercel.json` — **wymaga wdrożenia na Vercel**, patrz niżej).

Do zrobienia: Events (lista + kalendarz), Scheduler (przypisywanie kontrolerów +
oś czasu), Top Controllers (ranking), pełna strona Ops Briefing.

## Architektura

- **Next.js** — front-end (React) + backend w jednym projekcie.
- **Supabase (Postgres)** — dane wydarzeń, rosteru, pozycji i przypisań.
  - Odczyt: klucz `anon`/`publishable` bezpośrednio z przeglądarki (bezpieczny,
    ograniczony politykami RLS — tylko odczyt).
  - Zapis: wyłącznie z serwera (`pages/api/**`) kluczem `service_role`/`secret`,
    który nigdy nie trafia do przeglądarki ani do repozytorium.
- **PL-VACC API** (`cv.plvacc.pl`) — źródło danych o rosterze. Token trzymany
  wyłącznie po stronie serwera.

Dzięki temu podziałowi (sekrety tylko w zmiennych środowiskowych serwera)
**repozytorium może być publiczne** — w kodzie nie ma żadnych sekretów, tylko
bezpieczny do ujawnienia klucz `anon` Supabase.

## Uruchomienie lokalne

1. Zainstaluj zależności:
   ```
   npm install
   ```
2. Skopiuj `.env.example` do `.env.local` i uzupełnij:
   ```
   PLVACC_API_TOKEN=twoj_token_plvacc
   SUPABASE_SECRET_KEY=twoj_klucz_service_role
   CRON_SECRET=dowolny_losowy_ciag_znakow
   ```
   Plik `.env.local` jest w `.gitignore` — nigdy nie trafia do repozytorium.
3. Uruchom serwer deweloperski:
   ```
   npm run dev
   ```
4. Otwórz http://localhost:3000

## Wdrożenie na Vercel (wymagane do automatycznego crona o północy)

Lokalne `npm run dev` nie uruchomi crona samo z siebie — musi ktoś/coś
utrzymywać serwer non-stop. Najprościej wdrożyć na Vercel (darmowy plan
wystarczy, ma wbudowane Cron Jobs):

1. Wejdź na https://vercel.com, zaloguj się przez GitHub.
2. **Add New → Project** → wybierz repozytorium `Polish-VACC-Events`.
3. W ustawieniach projektu (Environment Variables) dodaj te same zmienne co
   w `.env.local`: `PLVACC_API_TOKEN`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`
   (dokładnie te same wartości).
4. Deploy. Vercel sam wykryje `vercel.json` i skonfiguruje cron na
   `/api/cron/roster` (codziennie 22:00 UTC).

Uwaga: 22:00 UTC to ok. północ czasu polskiego latem (CEST, UTC+2) i 23:00
zimą (CET, UTC+1) — przez zmianę czasu raz w roku synchronizacja "ucieknie"
o godzinę. Można to poprawić ręczną korektą `vercel.json` dwa razy do roku,
albo zaakceptować to niewielkie przesunięcie.

## Bezpieczeństwo sekretów

- Token PL-VACC API, klucz `service_role` Supabase i `CRON_SECRET` mieszkają
  wyłącznie w `.env.local` (lokalnie) lub w zmiennych środowiskowych Vercel —
  nigdy w kodzie ani w repozytorium.
- Klucz `anon`/`publishable` Supabase w `lib/supabaseClient.js` jest celowo
  jawny w kodzie — to jego przeznaczenie, bezpieczeństwo zapewnia RLS w bazie.
- `/api/sync/roster` (przycisk) nie ma jeszcze autoryzacji — każdy z dostępem
  do strony może go wywołać. To nieszkodliwa operacja (tylko odczyt z PLVACC +
  upsert), ale warto ograniczyć ją do administratorów, gdy powstanie logowanie.
- `/api/cron/roster` jest chroniony `CRON_SECRET` — Vercel dokłada nagłówek
  autoryzacyjny automatycznie przy zaplanowanych wywołaniach.

## Cel projektu

- Przegląd nadchodzących wydarzeń PLVACC (kalendarz eventów)
- Zapisy kontrolerów na konkretne stanowiska podczas eventu
- Podgląd i zarządzanie zapisami przez administratorów/organizatorów

## Stos technologiczny

- Next.js (React) — front-end + backend (API routes)
- Supabase (Postgres) — baza danych

## Rozwój

Projekt rozwijany przy współpracy z Claude.
