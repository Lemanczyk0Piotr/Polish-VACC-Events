import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ScheduleGrid from '../../components/ScheduleGrid';
import TimeField from '../../components/TimeField';
import { supabase } from '../../lib/supabaseClient';
import { colors, shared, font, positionTypeColor, formatDate, formatTimeZ } from '../../lib/theme';
import { useLang } from '../../lib/i18n';
import { useAdminMode, adminFetch } from '../../lib/adminMode';
import { renderScheduleImage } from '../../lib/scheduleImage';
import { controllerName } from '../../lib/identity';

const TYPE_ORDER = ['CTR', 'APP', 'TWR', 'GND', 'DEL'];

function sortControllers(list) {
  return [...list].sort((a, b) => {
    const aObs = a.rating === 'OBS';
    const bObs = b.rating === 'OBS';
    if (aObs !== bObs) return aObs ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}
function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minToHHMM(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function utcHHMM(iso) {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default function EventScheduler() {
  const router = useRouter();
  const { id } = router.query;
  const { lang, t } = useLang();
  const { isAdmin, password } = useAdminMode();

  const [event, setEvent] = useState(null);
  const [positions, setPositions] = useState(null);
  const [controllers, setControllers] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [error, setError] = useState(null);
  const [staffedOnly, setStaffedOnly] = useState(false);
  const [addingFor, setAddingFor] = useState(null); // position id
  const [notesDraft, setNotesDraft] = useState('');
  const [showGrid, setShowGrid] = useState(false);
  const [exportingBookings, setExportingBookings] = useState(false);
  const [sendingSchedule, setSendingSchedule] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [remarksDraft, setRemarksDraft] = useState('');

  const load = () => {
    if (!id) return;
    supabase.from('events').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) setError(error.message);
      else {
        setEvent(data);
        setNotesDraft(data?.notes || '');
      }
    });
    supabase.from('positions').select('*').order('callsign').then(({ data }) => setPositions(data || []));
    supabase
      .from('controllers')
      .select('*')
      .neq('status', 'inactive')
      .order('name')
      .then(({ data }) => setControllers(data || []));
    supabase
      .from('event_assignments')
      .select(
        '*, controllers:controllers!event_assignments_controller_id_fkey(id, name, cid, rating, is_mentor, discord_id), student:controllers!event_assignments_student_id_fkey(id, name, cid, rating), positions(callsign, type, frequency)'
      )
      .eq('event_id', id)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setAssignments(data || []);
      });
  };

  useEffect(load, [id]);

  const grouped = useMemo(() => {
    if (!positions || !assignments) return {};
    const byPos = {};
    for (const a of assignments) {
      byPos[a.position_id] = byPos[a.position_id] || [];
      byPos[a.position_id].push(a);
    }
    const g = {};
    for (const t of TYPE_ORDER) g[t] = [];
    for (const p of positions) {
      if (!TYPE_ORDER.includes(p.type)) continue;
      const list = byPos[p.id] || [];
      // Pozycja ukryta (positions.visible = false) nie pojawia się przy
      // rozpisywaniu obsady. Wyjątek: jeśli ktoś już na niej siedzi (bo
      // ukryto ją PO rozpisaniu), zostaje widoczna — inaczej nie dałoby się
      // tego przypisania zobaczyć ani usunąć.
      if (p.visible === false && list.length === 0) continue;
      if (staffedOnly && list.length === 0) continue;
      g[p.type].push({ position: p, assignments: list });
    }
    return g;
  }, [positions, assignments, staffedOnly]);

  const summaryByType = useMemo(() => {
    if (!assignments) return {};
    const g = {};
    for (const t of TYPE_ORDER) g[t] = [];
    for (const a of assignments) {
      const t = a.positions?.type;
      if (t && g[t]) g[t].push(a);
    }
    return g;
  }, [assignments]);

  // Default duration (minutes) used to prefill a brand-new slot when a
  // position has no assignments yet.
  const defaultDurationMin =
    event?.time_start && event?.time_end
      ? (() => {
          const d = ((toMin(event.time_end.slice(0, 5)) - toMin(event.time_start.slice(0, 5))) % 1440 + 1440) % 1440;
          return d || 1440;
        })()
      : 180;

  const addAssignment = async (positionId, controllerId, studentId, startHHMM, endHHMM) => {
    if (!event.event_date) {
      alert(t('scheduler.noDateAlert'));
      return;
    }
    let startMin = toMin(startHHMM);
    let endMin = toMin(endHHMM);
    if (endMin <= startMin) endMin += 1440;

    const dayMs = 24 * 3600 * 1000;
    const baseDate = new Date(`${event.event_date}T00:00:00Z`).getTime();
    const startIso = new Date(baseDate + startMin * 60000).toISOString();
    const endIso = new Date(baseDate + endMin * 60000).toISOString();

    // Client-side overlap guard for this position.
    const existing = assignments.filter((a) => a.position_id === positionId && a.time_start && a.time_end);
    const overlap = existing.some((a) => {
      const aS = new Date(a.time_start).getTime();
      const aE = new Date(a.time_end).getTime();
      return new Date(startIso).getTime() < aE && new Date(endIso).getTime() > aS;
    });
    if (overlap) {
      alert(t('scheduler.overlapAlert'));
      return;
    }

    const res = await adminFetch(password, '/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: id,
        position_id: positionId,
        controller_id: controllerId,
        student_id: studentId || null,
        time_start: startIso,
        time_end: endIso,
      }),
    });
    if (res.ok) {
      setAddingFor(null);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || t('scheduler.addFailed'));
    }
  };

  const removeAssignment = async (assignmentId) => {
    const res = await adminFetch(password, `/api/assignments/${assignmentId}`, { method: 'DELETE' });
    if (res.ok) load();
    else alert(t('scheduler.removeFailed'));
  };

  const clearAll = async () => {
    if (!confirm(t('scheduler.clearConfirm'))) return;
    const res = await adminFetch(password, `/api/assignments?event_id=${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else alert(t('scheduler.clearFailed'));
  };

  // Publikacja gotowej rozpiski obsady na Discordzie. Ta sama funkcja, której
  // używa automat na 24h przed eventem (lib/discordDispatch.js) — więc jeśli
  // admin wyśle ją ręcznie wcześniej, automat już jej nie powtórzy.
  // Ilu kontrolerów z tej rozpiski zostanie oznaczonych imiennie — do
  // pokazania w oknie wysyłki, żeby admin od razu widział, komu brakuje
  // wpisanego ID Discorda w Rosterze.
  const mentionStats = useMemo(() => {
    const seen = new Map();
    for (const a of assignments || []) {
      if (a.controllers?.id) seen.set(a.controllers.id, Boolean(a.controllers.discord_id));
    }
    return { total: seen.size, withId: Array.from(seen.values()).filter(Boolean).length };
  }, [assignments]);

  const openScheduleModal = () => {
    setRemarksDraft(event?.schedule_remarks || '');
    setScheduleModalOpen(true);
  };

  const sendScheduleToDiscord = async (force = false, remarks = remarksDraft) => {
    setScheduleModalOpen(false);
    setSendingSchedule(true);
    try {
      // Wykres Gantta rysowany jest tu, w przeglądarce, z tych samych danych
      // co podgląd na stronie — niezależnie od tego, czy admin ma go akurat
      // rozwiniętego przyciskiem "GENERUJ HARMONOGRAM". Jeśli się nie da
      // (event bez godzin albo żadna zmiana nie ma ustawionych godzin),
      // rozpiska i tak pójdzie, tyle że samym tekstem.
      let image = null;
      try {
        image = renderScheduleImage(event, assignments || [], remarks);
      } catch (imgErr) {
        image = null;
      }
      const res = await adminFetch(password, '/api/discord/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'schedule', event_id: id, force, image_base64: image, remarks }),
      });
      const data = await res.json();
      if (data?.skipped) {
        if (confirm(t('scheduler.sendScheduleAgain'))) {
          setSendingSchedule(false);
          return sendScheduleToDiscord(true, remarks);
        }
        return;
      }
      if (!res.ok) {
        alert(`${t('scheduler.sendScheduleFailed')}\n${data.error || ''}`);
        return;
      }
      alert(t('scheduler.sendScheduleOk'));
      load();
    } catch (e) {
      alert(t('scheduler.sendScheduleFailed'));
    } finally {
      setSendingSchedule(false);
    }
  };

  const exportBookings = async () => {
    const staffedPositions = new Set((assignments || []).map((a) => a.position_id));
    if (staffedPositions.size === 0) {
      alert(t('scheduler.exportBookingsNone'));
      return;
    }
    if (!confirm(t('scheduler.exportBookingsConfirm', { n: staffedPositions.size }))) return;
    setExportingBookings(true);
    try {
      const res = await adminFetch(password, '/api/bookings/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || t('scheduler.exportBookingsFailed'));
        return;
      }
      const ok = (data.created || []).length;
      const fail = (data.failed || []).length;
      let msg = t('scheduler.exportBookingsResult', { ok, fail });
      if (fail > 0) {
        msg += '\n' + data.failed.map((f) => `${f.position}: ${f.message}`).join('\n');
      }
      alert(msg);
    } catch (e) {
      alert(t('scheduler.exportBookingsFailed'));
    } finally {
      setExportingBookings(false);
    }
  };

  const saveNotes = async () => {
    await adminFetch(password, `/api/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesDraft }),
    });
  };

  if (error) {
    return (
      <Layout>
        <p style={{ color: colors.red }}>{error}</p>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout>
        <p style={shared.sub}>{t('scheduler.loading')}</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="pv-event-top-grid" style={styles.topGrid}>
        <div>
          {event.image_url ? (
            <img src={event.image_url} alt="" style={styles.banner} />
          ) : (
            <div style={styles.bannerPlaceholder}>{t('scheduler.noBanner')}</div>
          )}
          {event.external_link && (
            <a href={event.external_link} target="_blank" rel="noopener noreferrer" style={styles.canvaBtn}>
              {t('scheduler.canva')}
            </a>
          )}
        </div>
        <div>
          <h1 style={{ ...shared.h1, fontSize: '2rem' }}>{event.title}</h1>
          <p style={shared.sub}>
            {formatDate(event.event_date, lang)}
            {event.time_start ? ` · ${formatTimeZ(event.time_start)}` : ''}
            {event.time_end ? `–${formatTimeZ(event.time_end)}` : ''}
          </p>
          {event.short_description && <p style={styles.shortDescription}>{event.short_description}</p>}
          {isAdmin ? (
            <>
              <div style={styles.fieldLabel}>{t('scheduler.notes')}</div>
              <textarea
                style={{ ...shared.input, minHeight: 90, width: '100%', resize: 'vertical' }}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={saveNotes}
              />
            </>
          ) : (
            notesDraft && (
              <>
                <div style={styles.fieldLabel}>{t('scheduler.notes')}</div>
                <p style={{ color: colors.text, whiteSpace: 'pre-wrap', margin: 0 }}>{notesDraft}</p>
              </>
            )
          )}
        </div>
      </div>

      <div style={styles.summaryBar}>
        <div style={styles.fieldLabel}>{t('scheduler.assignedControllers')}</div>
        <div style={styles.summaryGroups}>
          {TYPE_ORDER.map((type) => {
            const list = summaryByType[type] || [];
            if (list.length === 0) return null;
            return (
              <div key={type} style={styles.summaryGroup}>
                <span style={{ color: positionTypeColor[type], fontWeight: 700, fontSize: '0.82rem' }}>{type}</span>
                {list.map((a) => (
                  <span key={a.id} style={{ color: colors.text, fontSize: '0.88rem' }}>
                    {controllerName(a.controllers, isAdmin)} ({a.controllers?.rating})
                    {a.student ? `${t('scheduler.studentLabel')}${controllerName(a.student, isAdmin)}` : ''}
                  </span>
                ))}
              </div>
            );
          })}
          {assignments && assignments.length === 0 && (
            <span style={{ color: colors.mutedDim, fontSize: '0.8rem' }}>{t('scheduler.noAssignments')}</span>
          )}
        </div>
      </div>

      {/* Funkcja zapisów (formularz + lista zgłoszeń dla admina) wyłączona na
          prośbę admina (2026-09-03) — niepotrzebna na obecnym etapie rozwoju
          aplikacji. Admin przypisuje kontrolerów bezpośrednio (patrz
          AddControllerForm poniżej). Endpoint /api/signups i tabela
          signup_requests zostają nietknięte (dane historyczne, np. na
          /events/[id]/stats), tylko UI do składania nowych zgłoszeń zniknęło. */}

      {isAdmin && (
        <>
          <div style={styles.controlsRow}>
            <button
              style={{ ...shared.btnGhost, ...(staffedOnly ? styles.toggleActive : {}) }}
              onClick={() => setStaffedOnly((v) => !v)}
            >
              {staffedOnly ? t('scheduler.staffedOnlyActive') : t('scheduler.staffedOnly')}
            </button>
            <button
              style={{ ...shared.btnPrimary, ...(showGrid ? {} : {}) }}
              onClick={() => setShowGrid((v) => !v)}
            >
              {showGrid ? t('scheduler.hideGrid') : t('scheduler.showGrid')}
            </button>
            <button style={shared.btnDanger} onClick={clearAll} disabled={!assignments || assignments.length === 0}>
              {t('scheduler.clearAll')}
            </button>
            <button
              style={shared.btnGhost}
              onClick={exportBookings}
              disabled={exportingBookings || !assignments || assignments.length === 0}
            >
              {exportingBookings ? t('scheduler.exportBookingsBusy') : t('scheduler.exportBookings')}
            </button>
            <button
              style={styles.discordBtn}
              onClick={openScheduleModal}
              disabled={sendingSchedule || !assignments || assignments.length === 0}
            >
              {sendingSchedule ? t('scheduler.sendScheduleBusy') : t('scheduler.sendSchedule')}
            </button>
          </div>

          {scheduleModalOpen && (
            <div style={shared.modalOverlay} onClick={() => setScheduleModalOpen(false)}>
              <div style={shared.modal} onClick={(e) => e.stopPropagation()}>
                <h2 style={shared.h1}>{t('scheduler.remarksTitle')}</h2>
                <p style={shared.sub}>{event?.title}</p>

                <label style={styles.remarksLabel}>{t('scheduler.remarksLabel')}</label>
                <textarea
                  style={{ ...shared.input, width: '100%', minHeight: 120, fontFamily: 'inherit' }}
                  value={remarksDraft}
                  onChange={(e) => setRemarksDraft(e.target.value)}
                  placeholder={t('scheduler.remarksPlaceholder')}
                />
                <div style={styles.remarksHint}>{t('scheduler.remarksHint')}</div>
                <div style={styles.remarksHint}>
                  {t('scheduler.remarksMentionInfo', { n: mentionStats.withId, total: mentionStats.total })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
                  <button type="button" style={shared.btnGhost} onClick={() => setScheduleModalOpen(false)}>
                    {t('scheduler.remarksCancel')}
                  </button>
                  <button type="button" style={shared.btnPrimary} onClick={() => sendScheduleToDiscord(false)}>
                    {t('scheduler.remarksSend')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showGrid && (
            <div style={{ ...shared.card, marginBottom: 24, overflowX: 'auto' }}>
              <ScheduleGrid event={event} assignments={assignments || []} />
            </div>
          )}

          {TYPE_ORDER.map((type) => {
            const list = grouped[type] || [];
            if (list.length === 0) return null;
            return (
              <section key={type} style={{ marginBottom: 24 }}>
                <div style={styles.typeHeader(positionTypeColor[type])}>{type}</div>
                <div style={styles.posGrid}>
                  {list.map(({ position, assignments: posAssignments }) => {
                    // Chain default start time from the latest existing shift end.
                    const withTimes = posAssignments.filter((a) => a.time_start && a.time_end);
                    let defaultStartHHMM = event.time_start ? event.time_start.slice(0, 5) : '00:00';
                    if (withTimes.length > 0) {
                      const latestEnd = withTimes.reduce(
                        (max, a) => Math.max(max, new Date(a.time_end).getTime()),
                        0
                      );
                      defaultStartHHMM = utcHHMM(new Date(latestEnd).toISOString());
                    }
                    const defaultEndHHMM = minToHHMM(toMin(defaultStartHHMM) + defaultDurationMin);

                    return (
                      <div key={position.id} style={shared.card}>
                        <div style={styles.posHead}>
                          <span style={{ fontWeight: 700 }}>{position.callsign}</span>
                          {position.frequency && <span style={styles.freq}>{position.frequency}</span>}
                        </div>
                        {posAssignments.length === 0 && <div style={styles.gapLine}>{t('scheduler.empty')}</div>}
                        {posAssignments.map((a) => (
                          <div key={a.id} style={styles.assignedRow}>
                            <div>
                              <span style={{ color: colors.text, fontWeight: 600 }}>{a.controllers?.name}</span>{' '}
                              <span style={{ color: colors.blue, fontSize: '0.85rem' }}>{a.controllers?.rating}</span>
                              {a.student?.name && (
                                <span style={{ color: colors.purple, fontSize: '0.85rem' }}>{t('scheduler.studentLabel')}{a.student.name}</span>
                              )}
                              <div style={{ fontSize: '0.8rem', color: colors.mutedDim }}>
                                {a.time_start && a.time_end
                                  ? `${utcHHMM(a.time_start)}-${utcHHMM(a.time_end)}z`
                                  : a.session_minutes
                                  ? `${a.session_minutes} min`
                                  : ''}
                              </div>
                            </div>
                            <button style={styles.removeBtn} onClick={() => removeAssignment(a.id)}>
                              ✕
                            </button>
                          </div>
                        ))}

                        {addingFor === position.id ? (
                          <AddControllerForm
                            controllers={controllers ? sortControllers(controllers) : []}
                            defaultStart={defaultStartHHMM}
                            defaultEnd={defaultEndHHMM}
                            onCancel={() => setAddingFor(null)}
                            onAdd={(controllerId, studentId, start, end) =>
                              addAssignment(position.id, controllerId, studentId, start, end)
                            }
                          />
                        ) : (
                          <button style={styles.addBtn} onClick={() => setAddingFor(position.id)}>
                            {t('scheduler.addController')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
      <style jsx global>{`
        @media (max-width: 760px) {
          .pv-event-top-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </Layout>
  );
}

function AddControllerForm({ controllers, defaultStart, defaultEnd, onCancel, onAdd }) {
  const { t } = useLang();
  const [controllerId, setControllerId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const selected = controllers.find((c) => c.id === controllerId);
  const isMentor = !!selected?.is_mentor;

  return (
    <div style={styles.addForm}>
      <select
        style={{ ...shared.input, width: '100%' }}
        value={controllerId}
        onChange={(e) => {
          setControllerId(e.target.value);
          setStudentId('');
        }}
      >
        <option value="">{t('scheduler.selectController')}</option>
        {controllers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.rating ? `(${c.rating})` : ''}
            {c.is_mentor ? t('scheduler.mentorSuffix') : ''}
          </option>
        ))}
      </select>

      {isMentor && (
        <select style={{ ...shared.input, width: '100%', marginTop: 8 }} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">{t('scheduler.selectStudent')}</option>
          {controllers
            .filter((c) => c.id !== controllerId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.rating ? `(${c.rating})` : ''}
              </option>
            ))}
        </select>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <TimeField value={start} onChange={setStart} />
        <span style={{ color: colors.mutedDim }}>–</span>
        <TimeField value={end} onChange={setEnd} />
        <span style={{ color: colors.mutedDim, fontSize: '0.7rem' }}>Z</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          style={{ ...shared.btnPrimary, marginLeft: 'auto' }}
          disabled={!controllerId}
          onClick={() => onAdd(controllerId, studentId, start, end)}
        >
          {t('scheduler.add')}
        </button>
        <button style={shared.btnGhost} onClick={onCancel}>
          {t('scheduler.cancel')}
        </button>
      </div>
    </div>
  );
}

// Publiczny formularz zapisu na event — widoczny dla wszystkich (nie tylko
// administratorów), bo to jedyna akcja dostępna dla zwykłych kontrolerów bez
// logowania. Tożsamość to po prostu wybór własnego imienia z listy
// (roadmap: prawdziwe konta to osobny, większy fundament na później).
// Searchable position picker: ONE text field with a native browser
// autocomplete dropdown (via <datalist>) — type to filter, click/select a
// suggestion to pick it. Replaces an earlier two-step "type in one box, then
// pick in a select below" layout that was confusing to use.
function PositionPicker({ positions, value, onPick, t, fieldId }) {
  const selected = positions.find((p) => p.id === value);
  const [text, setText] = useState(selected ? selected.callsign : '');

  const byCallsign = useMemo(() => {
    const m = new Map();
    for (const p of positions) m.set(p.callsign.trim().toUpperCase(), p.id);
    return m;
  }, [positions]);

  const listId = `position-options-${fieldId}`;

  return (
    <>
      <input
        type="text"
        list={listId}
        style={{ ...shared.input, width: '100%' }}
        value={text}
        placeholder={t('signup.anyPosition')}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          const id = byCallsign.get(val.trim().toUpperCase());
          onPick(id || '');
        }}
      />
      <datalist id={listId}>
        {positions.map((p) => (
          <option key={p.id} value={p.callsign} />
        ))}
      </datalist>
    </>
  );
}

const styles = {
  topGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 440px) 1fr', gap: 28, marginBottom: 28 },
  banner: { width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 12, background: colors.cardAlt, boxShadow: '0 1px 3px rgba(16, 24, 40, 0.06)' },
  bannerPlaceholder: {
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 12,
    border: `1px dashed ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.mutedDim,
    fontSize: '0.85rem',
  },
  canvaBtn: {
    display: 'inline-block',
    marginTop: 10,
    padding: '9px 16px',
    borderRadius: 8,
    border: `1px solid ${colors.purple}`,
    background: colors.purpleBg,
    color: colors.purple,
    fontWeight: 700,
    fontSize: '0.85rem',
    textDecoration: 'none',
  },
  fieldLabel: { fontSize: '0.8rem', color: colors.muted, marginBottom: 8, letterSpacing: '0.03em', fontWeight: 700 },
  summaryBar: {
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    background: colors.cardAlt,
    padding: 16,
    marginBottom: 20,
  },
  summaryGroups: { display: 'flex', flexDirection: 'column', gap: 6 },
  summaryGroup: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' },
  controlsRow: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  toggleActive: { borderColor: colors.amber, color: colors.amber },
  shortDescription: {
    color: colors.text,
    fontSize: '1rem',
    fontWeight: 600,
    lineHeight: 1.5,
    margin: '0 0 16px',
  },
  remarksLabel: { display: 'block', fontSize: '0.8rem', color: colors.muted, fontWeight: 700, margin: '4px 0 8px' },
  remarksHint: { fontSize: '0.78rem', color: colors.mutedDim, marginTop: 8, lineHeight: 1.5 },
  // Blurple Discorda — ten sam kolor przycisku co na liście wydarzeń.
  discordBtn: {
    ...shared.btnGhost,
    border: '1px solid #5865F2',
    background: 'rgba(88, 101, 242, 0.12)',
    color: '#4752C4',
    fontWeight: 700,
  },
  typeHeader: (color) => ({
    fontWeight: 700,
    fontSize: '0.98rem',
    letterSpacing: '0.05em',
    color,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: `1px solid ${colors.border}`,
  }),
  posGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 },
  posHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '1rem' },
  freq: { color: colors.blue, fontSize: '0.9rem', fontFamily: 'monospace' },
  gapLine: { color: colors.mutedDim, fontSize: '0.85rem', textAlign: 'center', margin: '8px 0' },
  assignedRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: colors.red,
    cursor: 'pointer',
    fontSize: '1rem',
  },
  addBtn: {
    marginTop: 8,
    width: '100%',
    padding: '9px 0',
    borderRadius: 6,
    border: `1px dashed ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  addForm: { marginTop: 8, padding: 10, borderRadius: 8, background: colors.cardAlt },
};
