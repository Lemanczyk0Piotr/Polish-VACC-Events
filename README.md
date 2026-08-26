# Polish VACC – Zapisy na wydarzenia

Interaktywny system dla kontrolerów Polish VACC (PLVACC) umożliwiający przeglądanie
nadchodzących wydarzeń (eventów) na sieci VATSIM oraz zapisywanie się na stanowiska
kontrolerskie podczas tych wydarzeń. Docelowo migracja z istniejącej aplikacji Base44.

## Status projektu

🚧 W budowie. Zrobione:
- Baza danych (Supabase/Postgres): tabele `controllers`, `positions`, `events`,
  `event_assignments`, RLS włączone (publiczny odczyt), zaimportowane dane startowe
  (34 kontrolerów, 39 pozycji, 21 eventów, 201 przypisań z historii sesji).
- Integracja z PL-VACC API (`/api/bookings`) — token ukryty po stronie serwera.
- Strony: **Roster** (lista kontrolerów z bazy), **Positions** (pozycje ATC z bazy).

Do zrobienia: Events (lista + kalendarz), Scheduler (przypisywanie kontrolerów +
oś czasu), Top Controllers (ranking), pełna strona Ops Briefing.

## Architektura

- **Next.js** — front-end (React) + backend w jednym projekcie.
- **Supabase (Postgres)** — dane wydarzeń, rosteru, pozycji i przypisań. Odczyt
  idzie bezpośrednio z przeglądarki (klucz `anon`, bezpieczny do ujawnienia,
  ograniczony politykami RLS). Zapis (tworzenie/edycja) będzie szedł wyłącznie
  przez serwerowe API routes z kluczem `service_role`, który nigdy nie trafia
  do przeglądarki.
- Wywołania do `cv.plvacc.pl/api/...` idą wyłącznie z serwera (Next.js API routes,
  folder `pages/api/`) — token PLVACC nigdy nie trafia do przeglądarki użytkownika.

## Uruchomienie lokalne

1. Zainstaluj zależności:
   ```
   npm install
   ```
2. Skopiuj `.env.example` do `.env.local` i uzupełnij prawdziwym tokenem PL-VACC:
   ```
   PLVACC_API_TOKEN=twoj_token
   ```
   Plik `.env.local` jest w `.gitignore` — nigdy nie trafia do repozytorium.
3. Uruchom serwer deweloperski:
   ```
   npm run dev
   ```
4. Otwórz http://localhost:3000

## Bezpieczeństwo sekretów

- Token PL-VACC API i (docelowo) klucz `service_role` Supabase mieszkają wyłącznie
  w `.env.local` (lokalnie) lub w zmiennych środowiskowych platformy hostingowej
  (np. Vercel → Project Settings → Environment Variables) — nigdy w kodzie ani
  w repozytorium.
- Klucz `anon` Supabase w `lib/supabaseClient.js` jest celowo jawny w kodzie —
  to jego przeznaczenie, bezpieczeństwo zapewnia RLS w bazie, nie ukrywanie klucza.
- Repozytorium jest **prywatne**.

## Cel projektu

- Przegląd nadchodzących wydarzeń PLVACC (kalendarz eventów)
- Zapisy kontrolerów na konkretne stanowiska podczas eventu
- Podgląd i zarządzanie zapisami przez administratorów/organizatorów

## Stos technologiczny

- Next.js (React) — front-end + backend (API routes)
- Supabase (Postgres) — baza danych

## Rozwój

Projekt rozwijany przy współpracy z Claude.
