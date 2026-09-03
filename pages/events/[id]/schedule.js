import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import ScheduleGrid from '../../../components/ScheduleGrid';
import { supabase } from '../../../lib/supabaseClient';
import { colors, shared, eventKindMeta, eventStatusMeta, formatDate, formatTimeZ } from '../../../lib/theme';
import { useLang } from '../../../lib/i18n';
import { useAdminMode } from '../../../lib/adminMode';

// Publiczna, samoaktualizująca się rozpiska pojedynczego eventu — link do tej
// strony można skopiować w panelu admina (przycisk "KOPIUJ LINK DO ROZPISKI"
// obok "GENERUJ HARMONOGRAM" na pages/events/[id].js) i wysłać komukolwiek,
// nawet bez konta/hasła. Ten sam link jest też automatycznie dołączany do
// rozpiski wysyłanej na Discorda (lib/discord.js, pole "ROZPISKA ONLINE").
//
// W przeciwieństwie do wykresu w panelu admina (widocznego tylko po kliknięciu
// "GENERUJ HARMONOGRAM"), ta strona:
// - jest dostępna bez logowania — dla kogokolwiek, kto ma link (prośba admina,
//   2026-09-03: "ten link moze byc dostepny dla kazdego kto taki link ma"),
// - odświeża dane co 30s, więc zostaje otwarta w tle i pokazuje aktualną
//   obsadę bez ręcznego przeładowania strony ("rozpiska ma się sama
//   aktualizować"),
// - respektuje granicę prywatności z lib/identity.js: bez zalogowania jako
//   admin widać tylko CID, nie imię i nazwisko (patrz isAdmin przekazywane do
//   ScheduleGrid).
const REFRESH_MS = 30000;

export default function PublicSchedule() {
  const router = useRouter();
  const { id } = router.query;
  const { lang, t } = useLang();
  const { isAdmin } = useAdminMode();

  const [event, setEvent] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(() => {
    if (!id) return;
    supabase
      .from('events')
      .select('id, title, event_date, time_start, time_end, kind, status')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setEvent(data);
      });
    supabase
      .from('event_assignments')
      .select(
        '*, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating), student:controllers!event_assignments_student_id_fkey(id, name, cid, rating), positions(callsign, type, frequency)'
      )
      .eq('event_id', id)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else {
          setAssignments(data || []);
          setLastUpdated(new Date());
        }
      });
  }, [id]);

  useEffect(load, [load]);

  // Samoodświeżanie — po to jest ta strona: ktoś zostawia ją otwartą (np. na
  // drugim monitorze albo telefonie) i widzi aktualną obsadę bez klikania
  // odśwież, nawet jeśli admin właśnie coś zmienia w panelu.
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [id, load]);

  if (error) {
    return (
      <Layout>
        <p style={{ color: colors.red }}>{error}</p>
      </Layout>
    );
  }

  if (!event || !assignments) {
    return (
      <Layout>
        <p style={{ color: colors.muted }}>{t('scheduler.loading')}</p>
      </Layout>
    );
  }

  const kindMeta = eventKindMeta[event.kind] || eventKindMeta.event;
  const kindKey = eventKindMeta[event.kind] ? event.kind : 'event';
  const statusMeta = eventStatusMeta[event.status] || eventStatusMeta.draft;
  const statusKey = eventStatusMeta[event.status] ? event.status : 'draft';

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={shared.badge(kindMeta.color, kindMeta.bg)}>{t(`events.kindLabel.${kindKey}`)}</span>
            <span style={shared.badge(statusMeta.color, 'transparent')}>{t(`events.statusLabel.${statusKey}`)}</span>
          </div>
          <h1 style={shared.h1}>{event.title}</h1>
          <p style={shared.sub}>
            {formatDate(event.event_date, lang)}
            {event.time_start ? ` · ${formatTimeZ(event.time_start)}` : ''}
            {event.time_end ? `–${formatTimeZ(event.time_end)}` : ''}
          </p>
        </div>
        <Link href={`/events/${event.id}`} style={styles.backBtn}>
          {t('scheduler.backToEvent')}
        </Link>
      </div>

      <p style={styles.hint}>
        {t('scheduler.publicScheduleHint')}
        {lastUpdated && (
          <span style={styles.hintTime}>
            {' · '}
            {lastUpdated.toLocaleTimeString(lang === 'pl' ? 'pl-PL' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </p>

      <div style={{ ...shared.card, overflowX: 'auto' }}>
        <ScheduleGrid event={event} assignments={assignments} isAdmin={isAdmin} />
      </div>
    </Layout>
  );
}

const styles = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  backBtn: {
    ...shared.btnGhost,
    textDecoration: 'none',
    display: 'inline-block',
  },
  hint: {
    color: colors.mutedDim,
    fontSize: '0.82rem',
    margin: '0 0 16px',
  },
  hintTime: {
    fontFamily: 'monospace',
  },
};
