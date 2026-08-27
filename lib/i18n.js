// Polski/angielski przełącznik języka aplikacji, na tej samej zasadzie co
// przełącznik jasny/ciemny motyw (components/Layout.js): stan trzymany w
// localStorage, domyślny render (SSR i pierwszy render klienta) zawsze
// polski (żeby nie było niezgodności hydracji), a prawdziwa zapisana
// preferencja jest odczytywana i stosowana dopiero w useEffect po mounту.
//
// LangProvider musi siedzieć nad Layout i nad treścią każdej strony, więc
// żyje w pages/_app.js. Komponenty czytają go hookiem useLang(), który
// zwraca { lang, setLang, t }. t('klucz.zagnieżdżony', wartości) odnajduje
// wpis w słowniku (obiekt zagnieżdżony po kropce); jeśli wpis jest funkcją,
// jest wywoływany z `wartości` (do interpolacji liczb/napisów w zdaniu).

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const translations = {
  pl: {
    nav: {
      sectionLabel: 'Nawigacja',
      externalLinks: 'Linki zewnętrzne',
      opsBriefing: 'OPS Briefing',
      events: 'Events',
      roster: 'Roster',
      positions: 'Positions',
      topControllers: 'Top Controllers',
    },
    theme: {
      toLight: 'Przełącz na jasny motyw',
      toDark: 'Przełącz na ciemny motyw',
      light: 'Jasny motyw',
      dark: 'Ciemny motyw',
    },
    lang: {
      switchTo: 'Switch to English',
      current: 'Polski',
    },
    footer: {
      tagline: '· Polish VACC Events Platform',
    },
    home: {
      platformTitle: 'PLVACC Event Scheduling Platform',
      emptySub: 'Stwórz swoje pierwsze wydarzenie, aby zacząć.',
      emptyCta: '+ NOWE WYDARZENIE',
      loading: 'Ładowanie…',
      eventLive: 'EVENT LIVE / PAST',
      timeToEvent: 'TIME TO EVENT',
      viewSchedule: 'Zobacz harmonogram →',
      statActive: 'AKTYWNI KONTROLERZY',
      statRegistered: 'ZAREJESTROWANI',
      statEvents: 'WYDARZENIA',
      sidebarHeader: 'OSTATNIE I NADCHODZĄCE WYDARZENIA',
      noNearby: 'Brak wydarzeń w ciągu ±1 tygodnia.',
      zuluLabel: 'CZAS ZULU',
      nextEvent: 'NASTĘPNE WYDARZENIE',
    },
    events: {
      title: 'EVENTS',
      count: ({ n }) => `${n} wpisów`,
      loading: 'Ładowanie…',
      newEvent: '+ EVENT',
      newExam: '+ EXAM',
      newAnnouncement: '+ ANNOUNCEMENT',
      showCompleted: 'POKAŻ ZAKOŃCZONE',
      showingCompleted: '✓ POKAZUJĘ ZAKOŃCZONE',
      signups: 'ZAPISY',
      edit: 'EDYTUJ',
      delete: 'USUŃ',
      confirmDelete: ({ title }) => `Usunąć „${title}”? Usunie to też wszystkie przypisania kontrolerów.`,
      deleteFailed: 'Nie udało się usunąć.',
      noEntries: 'Brak wpisów do pokazania.',
      modalEditTitle: 'EDYTUJ WPIS',
      modalNewTitle: ({ label }) => `NOWY: ${label}`,
      fieldTitle: 'Tytuł',
      fieldDate: 'Data',
      fieldStart: 'Start (Z)',
      fieldEnd: 'Koniec (Z)',
      fieldStatus: 'Status',
      fieldCategory: 'Kategoria (opcjonalnie)',
      categoryPlaceholder: 'np. Poland Sunday',
      fieldBanner: 'Baner (URL obrazka)',
      fieldExternalLink: 'Link zewnętrzny (np. Canva)',
      fieldNotes: 'Notatki',
      validationTitleDate: 'Podaj tytuł i datę.',
      saveError: 'Błąd zapisu',
      cancel: 'ANULUJ',
      save: 'ZAPISZ',
      saving: 'ZAPISUJĘ…',
    },
    scheduler: {
      loading: 'Ładowanie…',
      noBanner: 'BRAK BANERA',
      canva: 'CANVA ↗',
      notes: 'NOTATKI',
      assignedControllers: 'PRZYPISANI KONTROLERZY',
      studentLabel: ' / uczeń: ',
      noAssignments: 'Brak przypisań.',
      staffedOnly: 'TYLKO OBSADZONE',
      staffedOnlyActive: '✓ TYLKO OBSADZONE',
      showGrid: '⊞ GENERUJ HARMONOGRAM',
      hideGrid: '✕ UKRYJ HARMONOGRAM',
      clearAll: 'WYCZYŚĆ WSZYSTKO',
      empty: '- - - BRAK - - -',
      addController: '+ DODAJ KONTROLERA',
      selectController: '— wybierz kontrolera —',
      selectStudent: '— uczeń (opcjonalnie) —',
      mentorSuffix: ' · MENTOR',
      add: 'DODAJ',
      cancel: 'ANULUJ',
      noDateAlert: 'Wydarzenie nie ma ustawionej daty.',
      overlapAlert: 'Ten przedział czasu nachodzi na już przypisanego kontrolera na tej pozycji.',
      addFailed: 'Nie udało się dodać kontrolera.',
      clearConfirm: 'Usunąć WSZYSTKICH kontrolerów z tego harmonogramu?',
      clearFailed: 'Nie udało się wyczyścić.',
      removeFailed: 'Nie udało się usunąć.',
    },
    roster: {
      title: 'ROSTER',
      count: ({ n }) => `${n} kontrolerów zarejestrowanych`,
      loading: 'Ładowanie…',
      syncing: 'Synchronizuję…',
      syncNow: '⟳ Sync now (PL-VACC API)',
      searchPlaceholder: 'Szukaj po nazwisku, CID lub ratingu…',
      colName: 'NAME',
      colCid: 'VATSIM CID',
      colRating: 'RATING',
      colStatus: 'STATUS',
      mentorBadge: ' MENTOR',
      edit: 'EDYTUJ',
      syncError: 'Błąd synchronizacji',
      syncSuccess: ({ n }) => `Zsynchronizowano ${n} kontrolerów.`,
      syncErrorMsg: ({ msg }) => `Błąd: ${msg}`,
      saveError: 'Błąd zapisu',
      fieldStatus: 'STATUS',
      mentorLabel: 'Mentor',
      endorsements: 'ENDORSEMENTS',
      cancel: 'ANULUJ',
      save: 'ZAPISZ',
      saving: 'ZAPISUJĘ…',
    },
    positions: {
      title: 'POSITIONS',
      count: ({ n }) => `${n} pozycji ATC`,
      loading: 'Ładowanie…',
      searchPlaceholder: 'Szukaj callsign, nazwy lub częstotliwości…',
      all: 'ALL',
    },
    top: {
      title: 'TOP CONTROLLERS',
      subtitle: 'Ranking wg łącznego czasu na pozycji (zakończone wydarzenia)',
      exportCsv: 'EXPORT CSV',
      loading: 'Ładowanie…',
      noData: 'Brak danych z zakończonych wydarzeń.',
      sessions: ({ n }) => `${n} ${n === 1 ? 'sesja' : 'sesje'}`,
    },
    grid: {
      setDates: 'Ustaw datę oraz godzinę startu i końca wydarzenia, aby wygenerować harmonogram.',
      noAssignmentsWithTimes:
        'Brak przypisań z ustawionym czasem — dodaj kontrolerów z zakresem godzin, aby zobaczyć harmonogram.',
      studentLabel: ' / uczeń: ',
    },
  },
  en: {
    nav: {
      sectionLabel: 'Navigation',
      externalLinks: 'External Links',
      opsBriefing: 'OPS Briefing',
      events: 'Events',
      roster: 'Roster',
      positions: 'Positions',
      topControllers: 'Top Controllers',
    },
    theme: {
      toLight: 'Switch to light theme',
      toDark: 'Switch to dark theme',
      light: 'Light theme',
      dark: 'Dark theme',
    },
    lang: {
      switchTo: 'Przełącz na polski',
      current: 'English',
    },
    footer: {
      tagline: '· Polish VACC Events Platform',
    },
    home: {
      platformTitle: 'PLVACC Event Scheduling Platform',
      emptySub: 'Create your first event to get started.',
      emptyCta: '+ NEW EVENT',
      loading: 'Loading…',
      eventLive: 'EVENT LIVE / PAST',
      timeToEvent: 'TIME TO EVENT',
      viewSchedule: 'View schedule →',
      statActive: 'ACTIVE CONTROLLERS',
      statRegistered: 'REGISTERED',
      statEvents: 'EVENTS',
      sidebarHeader: 'RECENT AND UPCOMING EVENTS',
      noNearby: 'No events within ±1 week.',
      zuluLabel: 'ZULU TIME',
      nextEvent: 'NEXT EVENT',
    },
    events: {
      title: 'EVENTS',
      count: ({ n }) => `${n} entries`,
      loading: 'Loading…',
      newEvent: '+ EVENT',
      newExam: '+ EXAM',
      newAnnouncement: '+ ANNOUNCEMENT',
      showCompleted: 'SHOW COMPLETED',
      showingCompleted: '✓ SHOWING COMPLETED',
      signups: 'SIGN-UPS',
      edit: 'EDIT',
      delete: 'DELETE',
      confirmDelete: ({ title }) => `Delete "${title}"? This will also delete all controller assignments.`,
      deleteFailed: 'Failed to delete.',
      noEntries: 'No entries to show.',
      modalEditTitle: 'EDIT ENTRY',
      modalNewTitle: ({ label }) => `NEW: ${label}`,
      fieldTitle: 'Title',
      fieldDate: 'Date',
      fieldStart: 'Start (Z)',
      fieldEnd: 'End (Z)',
      fieldStatus: 'Status',
      fieldCategory: 'Category (optional)',
      categoryPlaceholder: 'e.g. Poland Sunday',
      fieldBanner: 'Banner (image URL)',
      fieldExternalLink: 'External link (e.g. Canva)',
      fieldNotes: 'Notes',
      validationTitleDate: 'Enter a title and date.',
      saveError: 'Save error',
      cancel: 'CANCEL',
      save: 'SAVE',
      saving: 'SAVING…',
    },
    scheduler: {
      loading: 'Loading…',
      noBanner: 'NO BANNER',
      canva: 'CANVA ↗',
      notes: 'NOTES',
      assignedControllers: 'ASSIGNED CONTROLLERS',
      studentLabel: ' / student: ',
      noAssignments: 'No assignments.',
      staffedOnly: 'STAFFED ONLY',
      staffedOnlyActive: '✓ STAFFED ONLY',
      showGrid: '⊞ GENERATE SCHEDULE',
      hideGrid: '✕ HIDE SCHEDULE',
      clearAll: 'CLEAR ALL',
      empty: '- - - EMPTY - - -',
      addController: '+ ADD CONTROLLER',
      selectController: '— select controller —',
      selectStudent: '— student (optional) —',
      mentorSuffix: ' · MENTOR',
      add: 'ADD',
      cancel: 'CANCEL',
      noDateAlert: 'This event has no date set.',
      overlapAlert: 'This time range overlaps with a controller already assigned to this position.',
      addFailed: 'Failed to add controller.',
      clearConfirm: 'Remove ALL controllers from this schedule?',
      clearFailed: 'Failed to clear.',
      removeFailed: 'Failed to remove.',
    },
    roster: {
      title: 'ROSTER',
      count: ({ n }) => `${n} controllers registered`,
      loading: 'Loading…',
      syncing: 'Syncing…',
      syncNow: '⟳ Sync now (PL-VACC API)',
      searchPlaceholder: 'Search by name, CID or rating…',
      colName: 'NAME',
      colCid: 'VATSIM CID',
      colRating: 'RATING',
      colStatus: 'STATUS',
      mentorBadge: ' MENTOR',
      edit: 'EDIT',
      syncError: 'Sync error',
      syncSuccess: ({ n }) => `Synced ${n} controllers.`,
      syncErrorMsg: ({ msg }) => `Error: ${msg}`,
      saveError: 'Save error',
      fieldStatus: 'STATUS',
      mentorLabel: 'Mentor',
      endorsements: 'ENDORSEMENTS',
      cancel: 'CANCEL',
      save: 'SAVE',
      saving: 'SAVING…',
    },
    positions: {
      title: 'POSITIONS',
      count: ({ n }) => `${n} ATC positions`,
      loading: 'Loading…',
      searchPlaceholder: 'Search callsign, name or frequency…',
      all: 'ALL',
    },
    top: {
      title: 'TOP CONTROLLERS',
      subtitle: 'Ranking by total time on position (completed events)',
      exportCsv: 'EXPORT CSV',
      loading: 'Loading…',
      noData: 'No data from completed events.',
      sessions: ({ n }) => `${n} ${n === 1 ? 'session' : 'sessions'}`,
    },
    grid: {
      setDates: 'Set the event date and start/end time to generate the schedule.',
      noAssignmentsWithTimes:
        'No assignments with times set — add controllers with a time range to see the schedule.',
      studentLabel: ' / student: ',
    },
  },
};

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const LangContext = createContext({
  lang: 'pl',
  setLang: () => {},
  t: (path) => path,
});

export function LangProvider({ children }) {
  // Default matches the server-rendered markup (Polish); the real stored
  // preference is picked up client-side right after mount, same pattern
  // as the dark/light theme toggle in components/Layout.js.
  const [lang, setLangState] = useState('pl');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pv-lang');
      if (stored === 'en' || stored === 'pl') setLangState(stored);
    } catch (e) {
      // ignore — language just won't persist across reloads
    }
  }, []);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem('pv-lang', next);
    } catch (e) {
      // ignore
    }
  }, []);

  const t = useCallback(
    (path, vars) => {
      const dict = translations[lang] || translations.pl;
      const val = getPath(dict, path) ?? getPath(translations.pl, path);
      if (typeof val === 'function') return val(vars || {});
      if (val === undefined) return path;
      return val;
    },
    [lang]
  );

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
