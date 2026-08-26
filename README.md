# Polish VACC – Zapisy na wydarzenia

Interaktywny system dla kontrolerów Polish VACC (PLVACC) umożliwiający przeglądanie
nadchodzących wydarzeń (eventów) na sieci VATSIM oraz zapisywanie się na stanowiska
kontrolerskie podczas tych wydarzeń.

## Status projektu

🚧 W budowie — podłączona pierwsza integracja z PL-VACC API (podgląd zapisów).

## Architektura

- **Next.js** — front-end (React) + backend w jednym projekcie.
- Wywołania do `cv.plvacc.pl/api/...` idą **wyłącznie z serwera** (Next.js API routes,
  folder `pages/api/`) — token PLVACC nigdy nie trafia do przeglądarki użytkownika.
- Front-end pyta tylko nasze własne endpointy (np. `/api/bookings`), które po stronie
  serwera doklejają token i przekazują żądanie dalej do PL-VACC API.

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

## Bezpieczeństwo tokena

- Token PL-VACC API mieszka wyłącznie w `.env.local` (lokalnie) lub w zmiennych
  środowiskowych platformy hostingowej (np. Vercel → Project Settings → Environment
  Variables) — nigdy w kodzie ani w repozytorium.
- Repozytorium powinno być **prywatne**.
- Jeśli token kiedykolwiek wycieknie (np. trafi do publicznego czatu, commita), należy
  go natychmiast zregenerować w panelu PL-VACC.

## Cel projektu

- Przegląd nadchodzących wydarzeń PLVACC (kalendarz eventów)
- Zapisy kontrolerów na konkretne stanowiska podczas eventu
- Podgląd i zarządzanie zapisami przez administratorów/organizatorów

## Stos technologiczny

- Next.js (React) — front-end + backend (API routes)

## Rozwój

Projekt rozwijany przy współpracy z Claude.
