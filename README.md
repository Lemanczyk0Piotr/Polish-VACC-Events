# Polish VACC – Zapisy na wydarzenia

Interaktywny system dla kontrolerów Polish VACC (PLVACC) umożliwiający przeglądanie
nadchodzących wydarzeń (eventów) na sieci VATSIM oraz zapisywanie się na stanowiska
kontrolerskie podczas tych wydarzeń. Docelowo migracja z istniejącej aplikacji Base44.

## Status projektu

Ciemny motyw "Night Vector" (jak w oryginalnej aplikacji Base44) na całej stronie.
Zrobione:
- Baza danych (Supabase/Postgres): tabele `controllers`, `positions`, `events`,
  `event_assignments`, RLS włączone (publiczny odczyt, zapis wyłącznie przez API).
- Integracja z PL-VACC API (`/api/bookings`) — token ukryty po stronie serwera.
- Eksport bookingów na CoreVACC (przycisk "EXPORT BOOKINGS" w scheduler evencie,
  tryb admina) — dla każdej obsadzonej pozycji tworzy jeden booking na pełne
  godziny eventu, właścicielem jest zawsze konto z `PLVACC_BOOKING_OWNER_NAME`.
- **Layout**: nawigacja z linkami zewnętrznymi (PLVACC, ACC SECTORS, STATSIM, MyVATSIM).
- **OPS Briefing** (`/`): najbliższe/ostatnie wydarzenie, odliczanie "TIME TO EVENT",
  statystyki (aktywni/zarejestrowani kontrolerzy, liczba wydarzeń), pasek boczny
  z wydarzeniami ±1 tydzień.
- **Events** (`/events`): lista z kolorowym oznaczeniem rodzaju (EVENT/EXAM/ANNOUNCEMENT),
  osobne przyciski tworzenia dla każdego rodzaju, baner, notatki, przełącznik "pokaż
  zakończone", tworzenie/edycja/usuwanie.
- **Event Scheduler** (`/events/[id]`): baner + notatki + link Canva, podsumowanie
  przypisanych kontrolerów (CTR→APP→TWR→GND→DEL), pozycje pogrupowane wg typu,
  dodawanie/usuwanie kontrolerów na pozycji, filtr "tylko obsadzone", czyszczenie
  całego harmonogramu.
- **Roster** (`/roster`): sortowanie po nazwisku/CID/ratingu, odznaki MENTOR/PE/CE
  (S2-CE, S3-CE, C1-CE z regułami ostrzegawczymi na czerwono), edycja statusu/mentora/
  endorsementów, synchronizacja z PL-VACC API.
- **Positions** (`/positions`): pozycje ATC z bazy (92 pozycje, ATIS pominięty).
- **Top Controllers** (`/top-controllers`): ranking wg łącznego czasu (tylko zakończone
  wydarzenia), rozwijalna lista sesji per kontroler, eksport CSV.
- Automatyczna synchronizacja rostera z PL-VACC API:
  - przycisk "Sync now" na stronie Roster (`/api/sync/roster`, tylko dla adminów),
  - cron co noc o 22:00 UTC / ~00:00 czasu polskiego (`/api/cron/roster`,
    skonfigurowany w `vercel.json` — **wymaga wdrożenia na Vercel**, patrz niżej).
- **Tryb administratora**: strona domyślnie działa jako publiczny widok dla
  zwykłych kontrolerów — mogą przeglądać eventy/roster/pozycje i zapisywać się
  na eventy (formularz z preferencjami pozycji, `signup_requests`), ale nie
  mogą nic tworzyć/edytować/usuwać ani odpalać synchronizacji z PLVACC.
  Ikonka kłódki w górnym pasku odblokowuje pełny panel administracyjny (jedno
  wspólne hasło `ADMIN_PANEL_PASSWORD`, patrz niżej) — to nie jest prawdziwy
  system kont/ról, tylko lekka bramka chroniąca też zapisowe endpointy API
  (nie tylko ukrywa przyciski w UI). Patrz `lib/adminAuth.js`, `lib/adminMode.js`.

Do zrobienia / możliwe następne kroki: kalendarz miesięczny na stronie Events,
oś czasu (Gantt) w Schedulerze, upload banera z pliku (na razie wklejasz URL obrazka),
parowanie mentor/uczeń, filtrowanie po typie pozycji w Schedulerze.

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
   PLVACC_BOOKING_OWNER_NAME=Imie Nazwisko - CID
   SUPABASE_SECRET_KEY=twoj_klucz_service_role
   CRON_SECRET=dowolny_losowy_ciag_znakow
   ADMIN_PANEL_PASSWORD=dowolne_haslo_dla_adminow
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
   w `.env.local`: `PLVACC_API_TOKEN`, `PLVACC_BOOKING_OWNER_NAME`,
   `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `ADMIN_PANEL_PASSWORD` (dokładnie te
   same wartości).
   Dla Discorda dochodzą jeszcze `DISCORD_WEBHOOK_URL`, `DISCORD_ROLE_ID` i
   `NEXT_PUBLIC_SITE_URL` (patrz sekcja „Integracja z Discordem").
4. Deploy. Vercel sam wykryje `vercel.json` i skonfiguruje dwa crony:
   `/api/cron/roster` (codziennie 22:00 UTC) i `/api/cron/discord`
   (codziennie 18:00 UTC).

Uwaga: 22:00 UTC to ok. północ czasu polskiego latem (CEST, UTC+2) i 23:00
zimą (CET, UTC+1) — przez zmianę czasu raz w roku synchronizacja "ucieknie"
o godzinę. Można to poprawić ręczną korektą `vercel.json` dwa razy do roku,
albo zaakceptować to niewielkie przesunięcie.

## Integracja z Discordem

Aplikacja sama wysyła na Discorda ogłoszenia eventów, przypomnienia,
przypomnienia o zapisach, gotowe rozpiski obsady, zaplanowane materiały
(opis + zdjęcie) i miesięczne podsumowanie Top Controllers.

**Nie ma osobnego procesu bota.** Wszystko idzie **webhookami** — zwykłym
POST-em HTTP z `pages/api/**` — a rytm wysyłek nadaje cron
(`/api/cron/discord`). Dzięki temu integracja mieści się w tym samym
projekcie na Vercelu i nic dodatkowego nie trzeba hostować. Prawdziwy bot
(discord.js, stałe połączenie z bramą Discorda) byłby potrzebny dopiero do
slash-komend, przycisków pod wiadomością i prywatnych DM-ów — patrz
`claude/feature-roadmap.md`.

### Konfiguracja (5 minut)

1. Na serwerze Discord: ustawienia kanału → **Integracje → Webhooki → Nowy
   webhook** → *Kopiuj URL webhooka*. Wklej go jako `DISCORD_WEBHOOK_URL`
   (jeden webhook wystarczy na start; osobne kanały można rozdzielić
   zmiennymi `DISCORD_WEBHOOK_EVENTS/SCHEDULE/MATERIALS/SUMMARY`).
2. Chcesz pingi? Włącz tryb dewelopera w Discordzie, prawy klik na rolę
   kontrolerów → *Kopiuj ID roli* → `DISCORD_ROLE_ID`.
3. Ustaw `NEXT_PUBLIC_SITE_URL` na adres tej strony — z tego budowane są
   linki „Zapisy / szczegóły" w wiadomościach.
4. Wszystkie zmienne (z opisami i wartościami domyślnymi) są w
   `.env.example`.

### Co i kiedy leci automatycznie

| Kiedy | Co |
| --- | --- |
| 5 dni przed eventem | przypomnienie o **zapisach** (+ licznik zgłoszeń) |
| 2 dni i 1 dzień przed | **przypomnienie o evencie** z pingiem roli |
| 1 dzień przed | **rozpiska obsady** (pozycje + zmiany + kontrolerzy) |
| o wyznaczonej godzinie | **materiały** z kolejki (panel `/discord`) |
| 1. dnia miesiąca | **Top Controllers** za miesiąc poprzedni |
| po opublikowaniu eventu | **ogłoszenie** — ręcznie przyciskiem `DISCORD`, albo automatycznie przy `DISCORD_AUTO_ANNOUNCE=1` |

Wszystkie te reguły da się przestawić zmiennymi (`DISCORD_REMINDER_DAYS`,
`DISCORD_SIGNUP_REMINDER_DAYS`, `DISCORD_SCHEDULE_DAYS_BEFORE`,
`DISCORD_REMINDER_HOUR`).

Każda wysyłka zapisuje się w tabeli `discord_posts` pod unikalnym kluczem
`(kind, ref_key)` — **nic nie poleci dwa razy**, nawet jeśli cron odpali się
sto razy dziennie albo admin wyśle coś ręcznie tuż przed automatem.

### Dokładność godzinowa materiałów

Plan **Hobby** na Vercelu odpala crony **raz na dobę**, więc `vercel.json`
ustawia `/api/cron/discord` na 18:00 UTC — przypomnienia, rozpiski i
podsumowania działają wtedy bez zarzutu, ale materiał zaplanowany „na 12:00"
pójdzie dopiero o 18:00. Dwa sposoby na dokładność godzinową:

- plan **Pro** → zmień w `vercel.json` na `"schedule": "0 * * * *"`,
- albo darmowy zewnętrzny pinger (np. cron-job.org) uderzający co godzinę w
  `https://twoja-domena/api/cron/discord?secret=<CRON_SECRET>`.

Panel `/discord` (tryb admina) pokazuje status webhooków, reguły automatu,
kolejkę materiałów i dziennik ostatnich wysyłek, ma przyciski testowe oraz
„URUCHOM AUTOMAT TERAZ".

## Bezpieczeństwo sekretów

- Token PL-VACC API, klucz `service_role` Supabase, `CRON_SECRET` i
  `ADMIN_PANEL_PASSWORD` mieszkają wyłącznie w `.env.local` (lokalnie) lub w
  zmiennych środowiskowych Vercel — nigdy w kodzie ani w repozytorium.
- Klucz `anon`/`publishable` Supabase w `lib/supabaseClient.js` jest celowo
  jawny w kodzie — to jego przeznaczenie, bezpieczeństwo zapewnia RLS w bazie.
- Wszystkie zapisowe endpointy administracyjne (`/api/events`, `/api/assignments`,
  `/api/controllers/[id]`, `/api/sync/roster`) wymagają nagłówka `x-admin-password`
  zgodnego z `ADMIN_PANEL_PASSWORD` (`lib/adminAuth.js`) — sam UI też ukrywa te
  przyciski przed niezalogowanymi, ale ochrona jest wymuszana na serwerze, więc
  nie da się jej ominąć wywołując API bezpośrednio.
- `/api/signups` (zapis kontrolera na event) jest celowo publiczny/bez hasła —
  to jedyna zapisowa akcja dostępna dla zwykłych kontrolerów.
- `/api/cron/roster` jest chroniony `CRON_SECRET` — Vercel dokłada nagłówek
  autoryzacyjny automatycznie przy zaplanowanych wywołaniach.
- `/api/cron/discord` przyjmuje ten sam `CRON_SECRET` (nagłówek `Authorization`
  **albo** `?secret=` w adresie, żeby dało się użyć zewnętrznego pingera) lub
  hasło administratora — inaczej odpowiada 401.
- **URL webhooka Discorda to sekret** — kto go zna, może pisać na kanał jako
  bot. Dlatego `/api/discord/status` zwraca do przeglądarki wyłącznie
  informację „ustawiony / nieustawiony", nigdy sam adres.
- Tabele `discord_posts` i `scheduled_posts` mają włączone RLS **bez polityk
  publicznych** — czyta i pisze do nich wyłącznie serwer kluczem
  `service_role`, klucz `anon` nie zobaczy tam nic.

## Cel projektu

- Przegląd nadchodzących wydarzeń PLVACC (kalendarz eventów)
- Zapisy kontrolerów na konkretne stanowiska podczas eventu
- Podgląd i zarządzanie zapisami przez administratorów/organizatorów

## Stos technologiczny

- Next.js (React) — front-end + backend (API routes)
- Supabase (Postgres) — baza danych

## Rozwój

Projekt rozwijany przy współpracy z Claude.
