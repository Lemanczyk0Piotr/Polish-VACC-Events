// Jedno miejsce, które decyduje, JAK podpisujemy kontrolera w interfejsie.
//
// Zasada (prośba usera, 2026-09-02): **kto nie jest zalogowany jako
// administrator, widzi wyłącznie CID** — nigdzie w aplikacji nie pokazujemy mu
// imion i nazwisk. Ta sama granica obowiązywała wcześniej tylko na
// /top-controllers; teraz jest wspólna dla wszystkich widoków.
//
// Domyślka `isAdmin = false` jest celowa: jeśli nowe miejsce zapomni przekazać
// flagi, pokaże mniej danych, a nie więcej.

// Krótki podpis: „Jan Kowalski" dla admina, „1633290" dla reszty.
// Do list, tabel i miejsc, gdzie obok i tak stoi rating albo godziny.
export function controllerName(c, isAdmin = false) {
  if (!c) return '—';
  const name = c.name || c.controller_name;
  const cid = c.cid || c.controller_cid;
  if (!isAdmin) return cid ? String(cid) : '—';
  return name || (cid ? String(cid) : '—');
}

// Pełny podpis: „Jan Kowalski · 1633290" dla admina, „1633290" dla reszty.
// Do statystyk, gdzie identyfikacja musi być jednoznaczna.
export function controllerLabel(c, isAdmin = false) {
  if (!c) return '—';
  const name = c.name || c.controller_name;
  const cid = c.cid || c.controller_cid;
  if (!isAdmin) return cid ? String(cid) : '—';
  if (name && cid) return `${name} · ${cid}`;
  return name || (cid ? String(cid) : '—');
}
