// Reguły "co i kiedy wysłać na Discorda" — jedno miejsce, z którego korzysta
// zarówno cron (/api/cron/discord), jak i ręczne przyciski w panelu admina
// (/api/discord/send). Dzięki temu wysyłka ręczna i automatyczna generują
// dokładnie tę samą wiadomość i wpisują się do tego samego dziennika
// (discord_posts), więc nic nie poleci dwa razy.
//
// Wszystkie reguły czasowe liczone są W DNIACH i w UTC (Zulu) — tak jak cała
// reszta aplikacji. Powód: cron na Vercelu w planie Hobby ma gwarancję
// odpalenia raz na dobę (Pro pozwala częściej), a reguła "event jest jutro"
// zadziała identycznie przy cronie godzinowym i dobowym. Bramka
// DISCORD_REMINDER_HOUR pilnuje, żeby przy cronie godzinowym przypomnienie
// nie poleciało o 00:05 w nocy.

import { getSupabaseAdmin } from './supabaseAdmin';
import { aggregateStats } from './statsAggregate';
import {
  buildEventEmbed,
  buildScheduleEmbeds,
  buildSummaryEmbed,
  buildPeriodEmbeds,
  buildMaterialEmbed,
  sendOnce,
  postToDiscord,
  eventUrl,
  siteUrl,
  SCHEDULE_IMAGE_NAME,
} from './discord';

const EVENT_SELECT =
  'id, title, event_date, time_start, time_end, kind, category, status, image_url, notes, external_link, statsim_url, schedule_remarks, created_at';

function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

function intEnv(name, fallback) {
  const raw = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(raw) ? raw : fallback;
}

function listEnv(name, fallback) {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function hhmm(iso) {
  if (!iso) return '??:??';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '??:??';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

async function getEvent(supabase, eventId) {
  const { data, error } = await supabase.from('events').select(EVENT_SELECT).eq('id', eventId).single();
  if (error) throw new Error(error.message);
  return data;
}

async function signupCount(supabase, eventId) {
  // Jedno zgłoszenie kontrolera to do 3 wierszy (priority 1-3), więc liczymy
  // unikalnych kontrolerów, a nie wierszy.
  const { data, error } = await supabase.from('signup_requests').select('controller_id').eq('event_id', eventId);
  if (error) return null;
  return new Set((data || []).map((r) => r.controller_id)).size;
}

// ---------------------------------------------------------------------------
// Pojedyncze typy wysyłek
// ---------------------------------------------------------------------------

export async function announceEvent(supabase, eventId, { force = false } = {}) {
  const event = await getEvent(supabase, eventId);
  const count = await signupCount(supabase, eventId);
  const url = eventUrl(event.id);
  const cta =
    event.kind === 'event' && url ? `Zapisy na wydarzenie: ${url}` : url ? `Szczegóły: ${url}` : undefined;

  return sendOnce({
    supabase,
    kind: 'event_announce',
    refKey: event.id,
    target: 'events',
    eventId: event.id,
    force,
    payload: {
      mentionRole: true,
      content: cta,
      embeds: [buildEventEmbed(event, { variant: 'announce', signupCount: count })],
    },
  });
}

export async function remindEvent(supabase, eventId, daysBefore, { force = false } = {}) {
  const event = await getEvent(supabase, eventId);
  const count = await signupCount(supabase, eventId);
  const url = eventUrl(event.id);
  const dayWord = daysBefore === 1 ? 'jutro' : `za ${daysBefore} dni`;
  const cta = [
    `**${event.title}** — start ${dayWord}!`,
    event.kind === 'event' && url ? `Zapisy / rozpiska: ${url}` : url ? `Szczegóły: ${url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return sendOnce({
    supabase,
    kind: `event_reminder_d${daysBefore}`,
    refKey: event.id,
    target: 'events',
    eventId: event.id,
    force,
    payload: {
      mentionRole: true,
      content: cta,
      embeds: [buildEventEmbed(event, { variant: 'reminder', signupCount: count })],
    },
  });
}

export async function remindSignups(supabase, eventId, daysBefore, { force = false } = {}) {
  const event = await getEvent(supabase, eventId);
  const count = await signupCount(supabase, eventId);
  const url = eventUrl(event.id);

  return sendOnce({
    supabase,
    kind: `signup_reminder_d${daysBefore}`,
    refKey: event.id,
    target: 'events',
    eventId: event.id,
    force,
    payload: {
      mentionRole: true,
      content: [
        `📋 **Zapisy na ${event.title}** są otwarte — zostało ${daysBefore} dni.`,
        count === 0
          ? 'Na razie nikt się nie zapisał.'
          : `Zgłoszonych kontrolerów: **${count}**.`,
        url ? `Zapisz się: ${url}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      embeds: [buildEventEmbed(event, { variant: 'reminder', signupCount: count })],
    },
  });
}

// Rozpiska — buduje listę pozycji z przypisanymi zmianami.
//
// `imageBase64` (opcjonalne) to PNG wykresu Gantta wygenerowany w przeglądarce
// na stronie eventu (lib/scheduleImage.js) i przekazany przez
// /api/discord/send. Automat z crona go nie ma — canvas istnieje tylko w
// przeglądarce — więc automatyczna rozpiska idzie samym tekstem, a ta wysłana
// ręcznie przyciskiem ma dodatkowo obrazek.
export async function sendSchedule(supabase, eventId, { force = false, imageBase64 = null } = {}) {
  const event = await getEvent(supabase, eventId);
  const { data: rows, error } = await supabase
    .from('event_assignments')
    .select(
      'id, time_start, time_end, positions(callsign, type), controllers:controllers!event_assignments_controller_id_fkey(name, cid, discord_id), student:controllers!event_assignments_student_id_fkey(name, cid, discord_id)'
    )
    .eq('event_id', eventId);
  if (error) throw new Error(error.message);

  // Kontroler z wpisanym controllers.discord_id jest oznaczany imiennie
  // (<@id>); reszta zostaje przy zwykłym imieniu i nazwisku.
  const mentionUsers = [];
  const who = (c) => {
    if (!c) return '—';
    if (c.discord_id) {
      mentionUsers.push(c.discord_id);
      return `<@${c.discord_id}>`;
    }
    return c.name || c.cid || '—';
  };

  const byPosition = new Map();
  for (const r of rows || []) {
    const callsign = r.positions?.callsign || '???';
    if (!byPosition.has(callsign)) byPosition.set(callsign, { callsign, type: r.positions?.type, items: [] });
    byPosition.get(callsign).items.push(r);
  }

  const positions = Array.from(byPosition.values())
    .sort((a, b) => a.callsign.localeCompare(b.callsign))
    .map((p) => {
      p.items.sort((a, b) => String(a.time_start).localeCompare(String(b.time_start)));
      return {
        callsign: p.callsign,
        lines: p.items.map((it) => {
          const student = it.student ? ` + ${who(it.student)} (uczeń)` : '';
          return `\`${hhmm(it.time_start)}–${hhmm(it.time_end)}\` ${who(it.controllers)}${student}`;
        }),
      };
    });

  if (positions.length === 0) {
    return { ok: false, error: 'Brak przypisanych kontrolerów — nie ma czego wysyłać.' };
  }

  const url = eventUrl(event.id);
  const remarks = event.schedule_remarks || '';

  // Wzmianki w EMBEDZIE wyświetlają się jako nazwa użytkownika, ale nikogo nie
  // powiadamiają — Discord wysyła powiadomienie tylko za wzmianki w treści
  // wiadomości. Dlatego lista oznaczonych kontrolerów jest powtórzona w
  // content, przycięta do limitu 2000 znaków.
  const uniqueMentions = [...new Set(mentionUsers)];
  let pingLine = null;
  if (uniqueMentions.length > 0) {
    const tags = uniqueMentions.map((idv) => `<@${idv}>`);
    const fitted = [];
    let len = 0;
    for (const tag of tags) {
      if (len + tag.length + 1 > 1200) break;
      fitted.push(tag);
      len += tag.length + 1;
    }
    pingLine = `Obsada: ${fitted.join(' ')}${fitted.length < tags.length ? ' …' : ''}`;
  }

  // W treści wiadomości uwagi tylko sygnalizujemy (pełna wersja i tak jest w
  // embedzie i na obrazku) — content ma twardy limit 2000 znaków.
  const remarksOneLine = remarks.trim().split(/\r?\n/).filter(Boolean).join(' · ');
  const remarksShort =
    remarksOneLine.length > 280 ? `${remarksOneLine.slice(0, 279)}…` : remarksOneLine;

  return sendOnce({
    supabase,
    kind: 'event_schedule',
    refKey: event.id,
    target: 'schedule',
    eventId: event.id,
    force,
    payload: {
      // Rozpiska NIE pinguje żadnej roli (prośba usera) — oznaczani są
      // wyłącznie kontrolerzy, którzy faktycznie siedzą na pozycjach.
      mentionRole: false,
      mentionUsers: uniqueMentions,
      content: [
        `🗒️ **Rozpiska — ${event.title}**`,
        remarksShort ? `📌 **UWAGI:** **${remarksShort}**` : null,
        pingLine,
        url ? `Pełny harmonogram: ${url}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      embeds: buildScheduleEmbeds(event, positions, { withImage: Boolean(imageBase64), remarks }),
      file: imageBase64
        ? { base64: imageBase64, name: SCHEDULE_IMAGE_NAME, contentType: 'image/png' }
        : undefined,
    },
  });
}

// Podsumowanie miesiąca (Top Controllers) — liczone z tych samych danych co
// strona /top-controllers: tylko eventy o statusie 'completed'.
export async function sendMonthlySummary(supabase, { year, month, force = false } = {}) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const to = `${nextMonth.y}-${String(nextMonth.m).padStart(2, '0')}-01`;

  const { data: rows, error } = await supabase
    .from('event_assignments')
    .select(
      'session_minutes, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating), events!inner(id, title, event_date, status)'
    )
    .eq('events.status', 'completed')
    .gte('events.event_date', from)
    .lt('events.event_date', to);
  if (error) throw new Error(error.message);

  const byController = new Map();
  const eventIds = new Set();
  let totalMinutes = 0;
  for (const r of rows || []) {
    if (!r.controllers) continue;
    eventIds.add(r.events?.id);
    const id = r.controllers.id;
    if (!byController.has(id)) {
      byController.set(id, {
        name: r.controllers.name,
        cid: r.controllers.cid,
        rating: r.controllers.rating,
        totalMinutes: 0,
        sessions: 0,
      });
    }
    const entry = byController.get(id);
    const mins = r.session_minutes || 0;
    entry.totalMinutes += mins;
    entry.sessions += 1;
    totalMinutes += mins;
  }

  const ranked = Array.from(byController.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return sendOnce({
    supabase,
    kind: 'monthly_summary',
    refKey: `${year}-${String(month).padStart(2, '0')}`,
    target: 'summary',
    force,
    payload: {
      mentionRole: false,
      content: `📊 **Podsumowanie miesiąca — ${label}**`,
      embeds: [
        buildSummaryEmbed({
          label,
          ranked,
          totalMinutes,
          eventCount: eventIds.size,
          showNames: (process.env.DISCORD_SUMMARY_SHOW_NAMES || '1') !== '0',
          top: intEnv('DISCORD_SUMMARY_TOP', 10),
        }),
      ],
    },
  });
}

// Ręczne przypomnienie z panelu /discord: administrator wybiera wydarzenie,
// role do pingnięcia (domyślnie PLVACC Controller, opcjonalnie C1/S3/S2) i
// może dopisać własny tekst.
//
// Świadomie BEZ blokady duplikatów: to akcja ręczna, a przypomnienie o tym
// samym evencie można chcieć wysłać kilka razy do różnych rang. Wpis w
// dzienniku dostaje unikalny klucz z czasem wysyłki, żeby historia i tak była
// widoczna w panelu.
export async function sendManualReminder(supabase, { eventId, roleKeys = ['controllers'], text = '' } = {}) {
  if (!eventId) throw new Error('Brak event_id.');
  const event = await getEvent(supabase, eventId);
  const count = await signupCount(supabase, eventId);
  const url = eventUrl(event.id);

  const result = await postToDiscord('events', {
    mentionRoleKeys: roleKeys.length > 0 ? roleKeys : null,
    content: [
      text.trim() || `⏰ Przypomnienie: **${event.title}**`,
      url ? `Szczegóły i zapisy: ${url}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    embeds: [buildEventEmbed(event, { variant: 'reminder', signupCount: count })],
  });

  await supabase.from('discord_posts').upsert(
    {
      kind: 'manual_reminder',
      ref_key: `${event.id}:${new Date().toISOString()}`,
      event_id: event.id,
      target: 'events',
      message_id: result.messageId || null,
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
      sent_at: new Date().toISOString(),
    },
    { onConflict: 'kind,ref_key' }
  );

  return { ...result, kind: 'manual_reminder' };
}

// Podsumowanie dowolnego okresu (przycisk na stronie /stats). Liczby liczone
// przez to samo lib/statsAggregate.js, którego używa strona — dzięki temu
// wiadomość na Discordzie i tabelka w aplikacji zawsze się zgadzają.
export async function sendPeriodSummary(supabase, { from, to, onlyCompleted = true, force = false } = {}) {
  if (!from || !to) throw new Error('Brak zakresu dat (from/to).');

  let query = supabase
    .from('events')
    .select('id, title, event_date, time_start, time_end, kind, status')
    .gte('event_date', from)
    .lte('event_date', to);
  if (onlyCompleted) query = query.eq('status', 'completed');

  const { data: events, error } = await query;
  if (error) throw new Error(error.message);

  const ids = (events || []).map((e) => e.id);
  let rows = [];
  if (ids.length > 0) {
    const { data, error: asErr } = await supabase
      .from('event_assignments')
      .select(
        'id, event_id, time_start, time_end, session_minutes, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating), positions(callsign, type)'
      )
      .in('event_id', ids);
    if (asErr) throw new Error(asErr.message);
    rows = data || [];
  }

  const stats = aggregateStats(rows, new Map((events || []).map((e) => [e.id, e])));
  if (stats.eventCount === 0) {
    return { ok: false, error: 'Brak wydarzeń w tym okresie — nie ma czego podsumować.' };
  }

  return sendOnce({
    supabase,
    kind: 'period_summary',
    // Zakres dat + tryb filtrowania w kluczu: podsumowanie "tylko zakończone"
    // i "wszystkie" za ten sam okres to dwie różne wiadomości, więc jedna nie
    // powinna blokować drugiej.
    refKey: `${from}..${to}${onlyCompleted ? '' : '+all'}`,
    target: 'summary',
    force,
    payload: {
      mentionRole: false,
      // Bez linii nad embedem: tytuł embeda mówi dokładnie to samo
      // ("PODSUMOWANIE OKRESU · <od> → <do>"), a powtórzone dwa razy pod sobą
      // wyglądało jak błąd.
      embeds: buildPeriodEmbeds({ from, to, stats }),
    },
  });
}

// Materiał z kolejki scheduled_posts. Nie używa sendOnce — kolejka ma własny
// status ('pending' -> 'sent'/'failed'), który jest tu źródłem prawdy.
export async function publishScheduledPost(supabase, post) {
  let event = null;
  if (post.event_id) {
    try {
      event = await getEvent(supabase, post.event_id);
    } catch (e) {
      event = null;
    }
  }

  const result = await postToDiscord(post.target || 'materials', {
    mentionRole: Boolean(post.mention_role),
    embeds: [buildMaterialEmbed(post, event)],
  });

  await supabase
    .from('scheduled_posts')
    .update({
      status: result.ok ? 'sent' : 'failed',
      sent_at: result.ok ? new Date().toISOString() : null,
      error: result.ok ? null : result.error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', post.id);

  await supabase.from('discord_posts').upsert(
    {
      kind: 'scheduled_post',
      ref_key: post.id,
      event_id: post.event_id || null,
      target: post.target || 'materials',
      message_id: result.messageId || null,
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
      sent_at: new Date().toISOString(),
    },
    { onConflict: 'kind,ref_key' }
  );

  return { ...result, kind: 'scheduled_post', refKey: post.id };
}

// ---------------------------------------------------------------------------
// Przebieg automatyczny (cron)
// ---------------------------------------------------------------------------

export async function runDiscordDispatch({ now = new Date(), force = false } = {}) {
  const supabase = getSupabaseAdmin();
  const results = [];
  const hourGate = now.getUTCHours() >= intEnv('DISCORD_REMINDER_HOUR', 18);

  const push = async (label, fn) => {
    try {
      const r = await fn();
      if (r && !r.skipped) results.push({ label, ...r });
    } catch (err) {
      results.push({ label, ok: false, error: err.message });
    }
  };

  // 1. Materiały z kolejki — jedyna rzecz zależna od DOKŁADNEJ godziny, więc
  //    bez bramki godzinowej: publikujemy wszystko, czego termin już minął.
  const { data: duePosts } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('publish_at', now.toISOString())
    .order('publish_at', { ascending: true })
    .limit(10);
  for (const post of duePosts || []) {
    await push(`material:${post.title || post.id}`, () => publishScheduledPost(supabase, post));
  }

  // 2. Automatyczne ogłoszenie świeżo opublikowanych eventów.
  //    Świadome ograniczenie do eventów utworzonych w ostatnich N dni: bez
  //    tego pierwsze uruchomienie integracji zalałoby kanał ogłoszeniami o
  //    wszystkich zaplanowanych już eventach.
  if ((process.env.DISCORD_AUTO_ANNOUNCE || '0') === '1' && hourGate) {
    const freshSince = addDays(now, -intEnv('DISCORD_AUTO_ANNOUNCE_MAX_AGE_DAYS', 3)).toISOString();
    const { data: fresh } = await supabase
      .from('events')
      .select('id, title, created_at')
      .eq('status', 'published')
      .gte('event_date', utcDateStr(now))
      .gte('created_at', freshSince);
    for (const ev of fresh || []) {
      await push(`announce:${ev.title}`, () => announceEvent(supabase, ev.id, { force }));
    }
  }

  // 3. Przypomnienia dzień/dwa przed (reguła dniowa: "event jest jutro" /
  //    "event jest pojutrze") + przypomnienia o zapisach wcześniej.
  if (hourGate) {
    const reminderDays = listEnv('DISCORD_REMINDER_DAYS', [2, 1]);
    for (const d of reminderDays) {
      const target = utcDateStr(addDays(now, d));
      const { data: evs } = await supabase
        .from('events')
        .select('id, title')
        .eq('event_date', target)
        .neq('status', 'draft')
        .neq('status', 'completed');
      for (const ev of evs || []) {
        await push(`reminder-d${d}:${ev.title}`, () => remindEvent(supabase, ev.id, d, { force }));
      }
    }

    const signupDays = listEnv('DISCORD_SIGNUP_REMINDER_DAYS', [5]);
    for (const d of signupDays) {
      const target = utcDateStr(addDays(now, d));
      const { data: evs } = await supabase
        .from('events')
        .select('id, title')
        .eq('event_date', target)
        .eq('kind', 'event')
        .neq('status', 'draft')
        .neq('status', 'completed');
      for (const ev of evs || []) {
        await push(`signups-d${d}:${ev.title}`, () => remindSignups(supabase, ev.id, d, { force }));
      }
    }

    // 4. Rozpiska N dni przed (domyślnie 1 — "ostateczny harmonogram
    //    24h przed eventem" z mapy drogowej).
    const scheduleDays = intEnv('DISCORD_SCHEDULE_DAYS_BEFORE', 1);
    const scheduleTarget = utcDateStr(addDays(now, scheduleDays));
    const { data: schedEvents } = await supabase
      .from('events')
      .select('id, title')
      .eq('event_date', scheduleTarget)
      .eq('kind', 'event')
      .neq('status', 'draft')
      .neq('status', 'completed');
    for (const ev of schedEvents || []) {
      await push(`schedule:${ev.title}`, () => sendSchedule(supabase, ev.id, { force }));
    }

    // 5. Podsumowanie miesiąca — pierwszego dnia miesiąca, za miesiąc
    //    poprzedni.
    if (now.getUTCDate() === 1) {
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      await push('monthly-summary', () =>
        sendMonthlySummary(supabase, {
          year: prev.getUTCFullYear(),
          month: prev.getUTCMonth() + 1,
          force,
        })
      );
    }
  }

  return {
    ran_at: now.toISOString(),
    hour_gate: hourGate,
    site_url: siteUrl(),
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => r.ok === false).length,
    results,
  };
}
