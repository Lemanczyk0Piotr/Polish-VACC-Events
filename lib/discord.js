// Warstwa integracji z Discordem — wysyłka wiadomości przez WEBHOOKI
// (a nie przez bota z gateway'em).
//
// Dlaczego webhooki, a nie discord.js: wszystko, czego potrzebuje PLVACC
// (ogłoszenia eventów, przypomnienia, rozpiski, materiały, podsumowania
// miesiąca), to komunikacja W JEDNĄ STRONĘ — aplikacja mówi, Discord
// wyświetla. Prawdziwy bot (stale otwarte połączenie WebSocket do bramy
// Discorda) byłby potrzebny dopiero do slash-komend (/status), przycisków
// pod wiadomością i prywatnych DM-ów — a taki proces nie zmieści się w
// Next.js na Vercelu (funkcje serverless są bezstanowe i krótko żyjące),
// wymagałby osobnego hostingu (Railway/Fly.io/VPS). Webhook to zwykły
// POST HTTP, więc działa z każdego endpointu w pages/api/** za darmo.
//
// Gdyby kiedyś doszedł prawdziwy bot: cała logika "co i kiedy wysłać" siedzi
// w lib/discordDispatch.js i w endpointach /api/discord/*, więc bot mógłby
// po prostu wołać te same endpointy zamiast duplikować reguły.

import { getSupabaseAdmin } from './supabaseAdmin';

// Nazwane "kanały" — każdemu odpowiada osobny webhook w zmiennych
// środowiskowych. Jeśli któryś nie jest ustawiony, używamy wspólnego
// DISCORD_WEBHOOK_URL (można więc wrzucać wszystko na jeden kanał i dopiero
// później rozdzielić, bez zmian w kodzie).
export const TARGETS = ['events', 'schedule', 'materials', 'summary'];

const TARGET_ENV = {
  events: 'DISCORD_WEBHOOK_EVENTS',
  schedule: 'DISCORD_WEBHOOK_SCHEDULE',
  materials: 'DISCORD_WEBHOOK_MATERIALS',
  summary: 'DISCORD_WEBHOOK_SUMMARY',
};

export function webhookFor(target) {
  const specific = process.env[TARGET_ENV[target] || ''];
  return (specific && specific.trim()) || (process.env.DISCORD_WEBHOOK_URL || '').trim() || null;
}

// Do panelu /discord: które kanały są skonfigurowane. Celowo NIE zwracamy
// samych URL-i webhooków — kto zna URL, może pisać na kanał, więc traktujemy
// je jak sekret i nigdy nie wysyłamy do przeglądarki.
export function configuredTargets() {
  const out = {};
  for (const t of TARGETS) out[t] = Boolean(webhookFor(t));
  return out;
}

export function siteUrl() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

export function eventUrl(eventId) {
  const base = siteUrl();
  return base ? `${base}/events/${eventId}` : null;
}

// Ping roli kontrolerów (np. @Controllers). Bez allowed_mentions Discord i tak
// by ją podświetlił, ale ustawiamy to jawnie, żeby wiadomość NIGDY nie mogła
// przypadkiem pingnąć @everyone ani pojedynczych osób — nawet gdyby ktoś
// wpisał "@everyone" w opisie eventu albo w treści materiału.
// `mentionUsers` to ID-ki użytkowników Discorda (controllers.discord_id),
// które wolno pingnąć w tej wiadomości. Discord wymaga wypisania ich w
// allowed_mentions.users — bez tego `<@id>` w treści wyświetli się jako
// wzmianka, ale nikogo nie powiadomi. Limit po stronie Discorda to 100 ID.
function mentionBlock(mentionRole, mentionUsers = []) {
  const roleId = (process.env.DISCORD_ROLE_ID || '').trim();
  const users = [...new Set(mentionUsers.filter(Boolean).map(String))].slice(0, 100);
  const allowed = { parse: [] };
  if (users.length > 0) allowed.users = users;
  if (mentionRole && roleId) {
    allowed.roles = [roleId];
    return { content: `<@&${roleId}>`, allowed_mentions: allowed };
  }
  return { content: undefined, allowed_mentions: allowed };
}

const KIND_COLOR = {
  event: 0xd32f2f,
  exam: 0x8e44ad,
  announcement: 0x00a3b4,
};

export function kindColor(kind) {
  return KIND_COLOR[kind] || KIND_COLOR.event;
}

// ---------------------------------------------------------------------------
// Czas
// ---------------------------------------------------------------------------

// events.event_date to DATE, events.time_start/time_end to TIME — jedno i
// drugie w strefie Zulu (UTC), tak jak cała reszta aplikacji.
function normalizeTime(t, fallback) {
  const raw = (t || fallback || '').toString().slice(0, 8);
  if (!raw) return null;
  return raw.length === 5 ? `${raw}:00` : raw;
}

export function eventStart(event) {
  if (!event?.event_date) return null;
  const t = normalizeTime(event.time_start, '00:00:00');
  const d = new Date(`${event.event_date}T${t}Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function eventEnd(event) {
  if (!event?.event_date || !event.time_end) return null;
  const d = new Date(`${event.event_date}T${normalizeTime(event.time_end)}Z`);
  return isNaN(d.getTime()) ? null : d;
}

// Znaczniki czasu Discorda: klient KAŻDEGO użytkownika renderuje je w jego
// własnej strefie czasowej i języku, więc nie musimy zgadywać, czy kontroler
// siedzi w Polsce, UK czy gdziekolwiek indziej.
export function ts(date, style = 'F') {
  if (!date) return '';
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function zuluRange(event) {
  const s = event?.time_start ? event.time_start.slice(0, 5) : null;
  const e = event?.time_end ? event.time_end.slice(0, 5) : null;
  if (s && e) return `${s}z – ${e}z`;
  if (s) return `${s}z`;
  return '—';
}

export function fmtDuration(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// Discord przycina embed po przekroczeniu limitów (opis 4096, wartość pola
// 1024) i odrzuca całą wiadomość, jeśli limit zostanie przekroczony — więc
// przycinamy sami, świadomie, z wielokropkiem.
export function clamp(text, max) {
  if (!text) return null;
  const s = String(text).trim();
  if (!s) return null;
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Wysyłka
// ---------------------------------------------------------------------------

// Zwraca { ok, messageId?, error? } — NIGDY nie rzuca. Wszystkie wywołania
// idą z crona albo z panelu admina, gdzie pojedyncza nieudana wysyłka nie
// powinna wywalać całej reszty przebiegu.
export async function postToDiscord(
  target,
  { embeds = [], mentionRole = false, mentionUsers = [], content, file } = {}
) {
  const url = webhookFor(target);
  if (!url) return { ok: false, error: `Brak webhooka dla kanału "${target}" w zmiennych środowiskowych.` };

  const mention = mentionBlock(mentionRole, mentionUsers);
  const body = {
    username: process.env.DISCORD_WEBHOOK_USERNAME || 'PLVACC Events',
    content: [mention.content, content].filter(Boolean).join('\n') || undefined,
    embeds: embeds.slice(0, 10),
    allowed_mentions: mention.allowed_mentions,
  };
  if (process.env.DISCORD_WEBHOOK_AVATAR_URL) body.avatar_url = process.env.DISCORD_WEBHOOK_AVATAR_URL;

  try {
    // Wiadomość z załącznikiem (obrazek rozpiski) musi iść jako
    // multipart/form-data: JSON trafia do pola payload_json, a plik do
    // files[0]. Embed odwołuje się do niego przez attachment://<nazwa>.
    // Bez pliku zostaje zwykły JSON — prostszy i szybszy.
    let init;
    if (file?.base64) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(body));
      const bytes = Buffer.from(file.base64, 'base64');
      form.append('files[0]', new Blob([bytes], { type: file.contentType || 'image/png' }), file.name || 'file.png');
      // Bez ręcznego Content-Type — fetch sam dokłada nagłówek z boundary.
      init = { method: 'POST', body: form };
    } else {
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      };
    }

    // ?wait=true — Discord odsyła wtedy utworzoną wiadomość (z jej id)
    // zamiast pustego 204, dzięki czemu możemy zapisać message_id w logu.
    const res = await fetch(`${url}?wait=true`, init);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Discord ${res.status}: ${text.slice(0, 300)}` };
    }
    let messageId = null;
    try {
      messageId = JSON.parse(text)?.id || null;
    } catch (e) {
      // 204 bez ciała — nic nie szkodzi, wysyłka i tak się udała.
    }
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Dziennik wysyłek / idempotencja
// ---------------------------------------------------------------------------
//
// Cron może zostać odpalony wielokrotnie (co godzinę, po redeployu, ręcznie z
// panelu). Każda LOGICZNA wysyłka ma unikalną parę (kind, ref_key) w tabeli
// discord_posts z indeksem UNIQUE — więc nawet gdyby dwa przebiegi ruszyły
// równolegle, drugi dostanie błąd unikalności i nic nie wyśle drugi raz.

export async function alreadySent(supabase, kind, refKey) {
  const { data } = await supabase
    .from('discord_posts')
    .select('id')
    .eq('kind', kind)
    .eq('ref_key', refKey)
    .eq('status', 'sent')
    .maybeSingle();
  return Boolean(data);
}

export async function logPost(supabase, row) {
  const { error } = await supabase.from('discord_posts').upsert(row, { onConflict: 'kind,ref_key' });
  if (error) throw error;
}

// Wyślij-i-zapisz w jednym kroku. `force` pomija sprawdzenie duplikatu
// (przycisk "wyślij mimo wszystko" w panelu admina).
export async function sendOnce({ supabase, kind, refKey, target, eventId = null, force = false, payload }) {
  const db = supabase || getSupabaseAdmin();
  if (!force && (await alreadySent(db, kind, refKey))) {
    return { skipped: true, reason: 'already-sent', kind, refKey };
  }
  const result = await postToDiscord(target, payload);
  await logPost(db, {
    kind,
    ref_key: refKey,
    event_id: eventId,
    target,
    message_id: result.messageId || null,
    status: result.ok ? 'sent' : 'failed',
    error: result.ok ? null : result.error,
    sent_at: new Date().toISOString(),
  });
  return { ...result, kind, refKey };
}

// ---------------------------------------------------------------------------
// Budowanie embedów
// ---------------------------------------------------------------------------

const KIND_LABEL = { event: 'EVENT', exam: 'EGZAMIN', announcement: 'OGŁOSZENIE' };

// variant: 'announce' | 'reminder'
export function buildEventEmbed(event, { variant = 'announce', signupCount = null } = {}) {
  const start = eventStart(event);
  const url = eventUrl(event.id);
  const fields = [];

  if (start) {
    fields.push({
      name: 'Kiedy',
      value: `${ts(start, 'F')}\n${ts(start, 'R')}`,
      inline: true,
    });
  }
  fields.push({ name: 'Godziny (Zulu)', value: zuluRange(event), inline: true });
  if (event.category) fields.push({ name: 'Kategoria', value: String(event.category), inline: true });
  if (typeof signupCount === 'number') {
    fields.push({
      name: 'Zapisy',
      value: signupCount > 0 ? `${signupCount} zgłoszonych kontrolerów` : 'Brak zgłoszeń — czekamy na Was!',
      inline: true,
    });
  }
  if (event.external_link) {
    fields.push({ name: 'Materiały', value: `[Otwórz](${event.external_link})`, inline: true });
  }
  if (event.statsim_url) {
    fields.push({ name: 'Statsim', value: `[Statystyki](${event.statsim_url})`, inline: true });
  }

  const embed = {
    title: clamp(`${KIND_LABEL[event.kind] || 'EVENT'} · ${event.title}`, 250),
    description: clamp(event.notes, 3500),
    color: kindColor(event.kind),
    fields,
    footer: { text: variant === 'reminder' ? 'Polish VACC · przypomnienie' : 'Polish VACC · nowe wydarzenie' },
  };
  if (url) embed.url = url;
  if (event.image_url) embed.image = { url: event.image_url };
  if (start) embed.timestamp = start.toISOString();
  return embed;
}

// Rozpiska: pozycje pogrupowane w pola embeda. Discord dopuszcza 25 pól na
// embed i 10 embedów na wiadomość, więc dzielimy na kawałki po 25 — event z
// 40 pozycjami wyśle się jako dwa embedy w jednej wiadomości, nie urwie się.
export const SCHEDULE_IMAGE_NAME = 'rozpiska.png';

// Pogrubia każdą niepustą linię osobno. Naiwne otoczenie całego bloku
// gwiazdkami psuje się na pustych liniach (Discord pokazuje wtedy dosłowne
// "****") i na wielolinijkowych wstawkach.
function boldLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `**${line.trim()}**` : ''))
    .join('\n');
}

export function buildScheduleEmbeds(event, positionsWithShifts, { withImage = false, remarks = '' } = {}) {
  const start = eventStart(event);
  const url = eventUrl(event.id);
  const chunks = [];
  for (let i = 0; i < positionsWithShifts.length; i += 25) {
    chunks.push(positionsWithShifts.slice(i, i + 25));
  }
  if (chunks.length === 0) chunks.push([]);

  return chunks.map((chunk, idx) => {
    const embed = {
      color: kindColor(event.kind),
      fields: chunk.map((p) => ({
        name: p.callsign,
        value: clamp(p.lines.join('\n'), 1000) || '—',
        inline: true,
      })),
    };
    if (idx === 0) {
      embed.title = clamp(`ROZPISKA · ${event.title}`, 250);
      embed.description = [
        start ? `${ts(start, 'F')} · ${ts(start, 'R')}` : null,
        `Godziny: **${zuluRange(event)}**`,
        // Uwagi administratora — pogrubione i oddzielone kreską, żeby nie
        // zginęły w tabeli pozycji.
        remarks && remarks.trim() ? `\n**📌 UWAGI**\n${boldLines(clamp(remarks, 1500))}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      if (url) embed.url = url;
    }
    if (idx === chunks.length - 1) {
      embed.footer = { text: 'Polish VACC · rozpiska' };
      // Wykres Gantta z tej samej strony, dołączony jako plik do wiadomości.
      // Ląduje na ostatnim embedzie, żeby obrazek był pod listą pozycji.
      if (withImage) embed.image = { url: `attachment://${SCHEDULE_IMAGE_NAME}` };
    }
    return embed;
  });
}

export function buildSummaryEmbed({ label, ranked, totalMinutes, eventCount, showNames = true, top = 10 }) {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranked.slice(0, top).map((c, i) => {
    const who = showNames ? c.name || c.cid || '—' : c.cid || '—';
    const prefix = medals[i] || `**${i + 1}.**`;
    return `${prefix} ${who}${c.rating ? ` \`${c.rating}\`` : ''} — **${fmtDuration(c.totalMinutes)}** (${c.sessions} sesji)`;
  });

  return {
    title: clamp(`TOP CONTROLLERS · ${label}`, 250),
    description: clamp(lines.join('\n') || 'Brak zakończonych eventów w tym okresie.', 3500),
    color: 0xd32f2f,
    fields: [
      { name: 'Łączny czas', value: fmtDuration(totalMinutes), inline: true },
      { name: 'Eventy', value: String(eventCount), inline: true },
      { name: 'Kontrolerzy', value: String(ranked.length), inline: true },
    ],
    footer: { text: 'Polish VACC · podsumowanie miesiąca' },
    url: siteUrl() ? `${siteUrl()}/top-controllers` : undefined,
  };
}

// Podsumowanie dowolnego okresu — ta sama treść, którą pokazuje strona
// /stats, tylko spłaszczona do trzech pól embeda. Liczby pochodzą z
// lib/statsAggregate.js, więc nie mogą się rozjechać z tym, co widać na
// stronie.
export function buildPeriodEmbed({ from, to, stats, topControllers = 10, topEvents = 12 }) {
  const medals = ['🥇', '🥈', '🥉'];
  const controllerLines = stats.controllers.slice(0, topControllers).map((c, i) => {
    const who = c.name && c.cid ? `${c.name} · ${c.cid}` : c.name || c.cid || '—';
    const prefix = medals[i] || `**${i + 1}.**`;
    return `${prefix} ${who} — **${fmtDuration(c.minutes)}** (${c.eventCount} ev.)`;
  });

  const eventLines = stats.events.slice(0, topEvents).map((e) => {
    const date = (e.event_date || '').slice(5); // MM-DD, rok jest w tytule embeda
    return `\`${date}\` **${e.title}** — ${e.controllerCount} ktrl. · ${fmtDuration(e.minutes)}`;
  });

  const typeLines = stats.types.map(
    (ty) => `**${ty.type}** — ${fmtDuration(ty.minutes)} (${ty.positionCount} poz.)`
  );

  const fields = [];
  if (controllerLines.length) {
    fields.push({ name: '🏆 Top kontrolerzy', value: clamp(controllerLines.join('\n'), 1000) || '—' });
  }
  if (eventLines.length) {
    const more = stats.events.length > topEvents ? `\n…i ${stats.events.length - topEvents} więcej` : '';
    fields.push({ name: '📅 Wydarzenia', value: clamp(eventLines.join('\n') + more, 1000) || '—' });
  }
  if (typeLines.length) {
    fields.push({ name: '🎧 Typy pozycji', value: clamp(typeLines.join('\n'), 1000) || '—', inline: true });
  }

  const embed = {
    title: clamp(`PODSUMOWANIE OKRESU · ${from} → ${to}`, 250),
    description: [
      `Wydarzenia: **${stats.eventCount}**`,
      `Łączny czas kontroli: **${fmtDuration(stats.totalMinutes)}**`,
      `Kontrolerzy: **${stats.controllerCount}** · pozycje: **${stats.positionCount}** · zmiany: **${stats.shiftCount}**`,
    ].join('\n'),
    color: 0xd32f2f,
    fields,
    footer: { text: 'Polish VACC · podsumowanie okresu' },
  };
  const base = siteUrl();
  if (base) embed.url = `${base}/stats`;
  return embed;
}

export function buildMaterialEmbed(post, event) {
  const embed = {
    title: clamp(post.title || event?.title || 'Materiały', 250),
    description: clamp(post.body, 3500),
    color: kindColor(event?.kind),
    footer: { text: 'Polish VACC' },
  };
  if (post.image_url) embed.image = { url: post.image_url };
  const url = event ? eventUrl(event.id) : null;
  if (url) embed.url = url;
  if (event) {
    const start = eventStart(event);
    embed.fields = [
      { name: 'Wydarzenie', value: clamp(event.title, 200) || '—', inline: true },
      ...(start ? [{ name: 'Kiedy', value: `${ts(start, 'F')}\n${ts(start, 'R')}`, inline: true }] : []),
    ];
  }
  return embed;
}
