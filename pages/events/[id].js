import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabaseClient';
import { colors, shared, positionTypeColor, formatDatePl, formatTimeZ } from '../../lib/theme';

const TYPE_ORDER = ['CTR', 'APP', 'TWR', 'GND', 'DEL'];

function sortControllers(list) {
  return [...list].sort((a, b) => {
    const aObs = a.rating === 'OBS';
    const bObs = b.rating === 'OBS';
    if (aObs !== bObs) return aObs ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export default function EventScheduler() {
  const router = useRouter();
  const { id } = router.query;

  const [event, setEvent] = useState(null);
  const [positions, setPositions] = useState(null);
  const [controllers, setControllers] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [error, setError] = useState(null);
  const [staffedOnly, setStaffedOnly] = useState(false);
  const [addingFor, setAddingFor] = useState(null); // position id
  const [notesDraft, setNotesDraft] = useState('');

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
      .select('*, controllers(name, rating, is_mentor), positions(callsign, type)')
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

  const totalMinutes = event?.time_start && event?.time_end
    ? Math.max(0, (toMin(event.time_end) - toMin(event.time_start) + 1440) % 1440) || 180
    : 180;

  const addAssignment = async (positionId, controllerId, minutes) => {
    const res = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: id,
        position_id: positionId,
        controller_id: controllerId,
        session_minutes: minutes,
      }),
    });
    if (res.ok) {
      setAddingFor(null);
      load();
    } else {
      alert('Nie udało się dodać kontrolera.');
    }
  };

  const removeAssignment = async (assignmentId) => {
    const res = await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
    if (res.ok) load();
    else alert('Nie udało się usunąć.');
  };

  const clearAll = async () => {
    if (!confirm('Usunąć WSZYSTKICH kontrolerów z tego harmonogramu?')) return;
    const res = await fetch(`/api/assignments?event_id=${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else alert('Nie udało się wyczyścić.');
  };

  const saveNotes = async () => {
    await fetch(`/api/events/${id}`, {
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
        <p style={shared.sub}>Ładowanie…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={styles.topGrid}>
        <div>
          {event.image_url ? (
            <img src={event.image_url} alt="" style={styles.banner} />
          ) : (
            <div style={styles.bannerPlaceholder}>BRAK BANERA</div>
          )}
          {event.external_link && (
            <a href={event.external_link} target="_blank" rel="noopener noreferrer" style={styles.canvaBtn}>
              CANVA ↗
            </a>
          )}
        </div>
        <div>
          <h1 style={shared.h1}>{event.title}</h1>
          <p style={shared.sub}>
            {formatDatePl(event.event_date)}
            {event.time_start ? ` · ${formatTimeZ(event.time_start)}` : ''}
            {event.time_end ? `–${formatTimeZ(event.time_end)}` : ''}
          </p>
          <div style={styles.fieldLabel}>NOTATKI</div>
          <textarea
            style={{ ...shared.input, minHeight: 90, width: '100%', resize: 'vertical' }}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={saveNotes}
          />
        </div>
      </div>

      <div style={styles.summaryBar}>
        <div style={styles.fieldLabel}>PRZYPISANI KONTROLERZY</div>
        <div style={styles.summaryGroups}>
          {TYPE_ORDER.map((t) => {
            const list = summaryByType[t] || [];
            if (list.length === 0) return null;
            return (
              <div key={t} style={styles.summaryGroup}>
                <span style={{ color: positionTypeColor[t], fontWeight: 700, fontSize: '0.72rem' }}>{t}</span>
                {list.map((a) => (
                  <span key={a.id} style={{ color: '#fff', fontSize: '0.78rem' }}>
                    {a.controllers?.name} ({a.controllers?.rating})
                  </span>
                ))}
              </div>
            );
          })}
          {assignments && assignments.length === 0 && (
            <span style={{ color: colors.mutedDim, fontSize: '0.8rem' }}>Brak przypisań.</span>
          )}
        </div>
      </div>

      <div style={styles.controlsRow}>
        <button
          style={{ ...shared.btnGhost, ...(staffedOnly ? styles.toggleActive : {}) }}
          onClick={() => setStaffedOnly((v) => !v)}
        >
          {staffedOnly ? '✓ TYLKO OBSADZONE' : 'TYLKO OBSADZONE'}
        </button>
        <button style={shared.btnDanger} onClick={clearAll} disabled={!assignments || assignments.length === 0}>
          WYCZYŚĆ WSZYSTKO
        </button>
      </div>

      {TYPE_ORDER.map((t) => {
        const list = grouped[t] || [];
        if (list.length === 0) return null;
        return (
          <section key={t} style={{ marginBottom: 24 }}>
            <div style={styles.typeHeader(positionTypeColor[t])}>{t}</div>
            <div style={styles.posGrid}>
              {list.map(({ position, assignments: posAssignments }) => (
                <div key={position.id} style={shared.card}>
                  <div style={styles.posHead}>
                    <span style={{ fontWeight: 700 }}>{position.callsign}</span>
                    {position.frequency && <span style={styles.freq}>{position.frequency}</span>}
                  </div>
                  {posAssignments.length === 0 && (
                    <div style={styles.gapLine}>- - - BRAK - - -</div>
                  )}
                  {posAssignments.map((a) => (
                    <div key={a.id} style={styles.assignedRow}>
                      <div>
                        <span style={{ color: '#fff', fontWeight: 600 }}>{a.controllers?.name}</span>{' '}
                        <span style={{ color: colors.blue, fontSize: '0.75rem' }}>{a.controllers?.rating}</span>
                        {a.session_minutes && (
                          <div style={{ fontSize: '0.7rem', color: colors.mutedDim }}>
                            {a.session_minutes} min
                          </div>
                        )}
                      </div>
                      <button style={styles.removeBtn} onClick={() => removeAssignment(a.id)}>
                        ✕
                      </button>
                    </div>
                  ))}

                  {addingFor === position.id ? (
                    <AddControllerForm
                      controllers={controllers ? sortControllers(controllers) : []}
                      defaultMinutes={totalMinutes}
                      onCancel={() => setAddingFor(null)}
                      onAdd={(controllerId, minutes) => addAssignment(position.id, controllerId, minutes)}
                    />
                  ) : (
                    <button style={styles.addBtn} onClick={() => setAddingFor(position.id)}>
                      + DODAJ KONTROLERA
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </Layout>
  );
}

function AddControllerForm({ controllers, defaultMinutes, onCancel, onAdd }) {
  const [controllerId, setControllerId] = useState('');
  const [minutes, setMinutes] = useState(defaultMinutes);

  return (
    <div style={styles.addForm}>
      <select style={{ ...shared.input, width: '100%' }} value={controllerId} onChange={(e) => setControllerId(e.target.value)}>
        <option value="">— wybierz kontrolera —</option>
        {controllers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.rating ? `(${c.rating})` : ''}
            {c.is_mentor ? ' · MENTOR' : ''}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          type="number"
          min="1"
          style={{ ...shared.input, width: 90 }}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
        <span style={{ alignSelf: 'center', color: colors.mutedDim, fontSize: '0.75rem' }}>min</span>
        <button
          style={{ ...shared.btnPrimary, marginLeft: 'auto' }}
          disabled={!controllerId}
          onClick={() => onAdd(controllerId, minutes)}
        >
          DODAJ
        </button>
        <button style={shared.btnGhost} onClick={onCancel}>
          ANULUJ
        </button>
      </div>
    </div>
  );
}

function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const styles = {
  topGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 380px) 1fr', gap: 24, marginBottom: 24 },
  banner: { width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, background: colors.cardAlt },
  bannerPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    border: `1px dashed ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.mutedDim,
    fontSize: '0.75rem',
  },
  canvaBtn: {
    display: 'inline-block',
    marginTop: 10,
    padding: '8px 14px',
    borderRadius: 8,
    border: `1px solid ${colors.purple}`,
    background: colors.purpleBg,
    color: colors.purple,
    fontWeight: 700,
    fontSize: '0.75rem',
    textDecoration: 'none',
  },
  fieldLabel: { fontSize: '0.7rem', color: colors.muted, marginBottom: 8, letterSpacing: '0.03em', fontWeight: 700 },
  summaryBar: {
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    background: colors.cardAlt,
    padding: 16,
    marginBottom: 20,
  },
  summaryGroups: { display: 'flex', flexDirection: 'column', gap: 6 },
  summaryGroup: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' },
  controlsRow: { display: 'flex', gap: 10, marginBottom: 20 },
  toggleActive: { borderColor: colors.amber, color: colors.amber },
  typeHeader: (color) => ({
    fontWeight: 700,
    fontSize: '0.85rem',
    letterSpacing: '0.05em',
    color,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: `1px solid ${colors.border}`,
  }),
  posGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },
  posHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  freq: { color: colors.blue, fontSize: '0.8rem', fontFamily: 'monospace' },
  gapLine: { color: colors.mutedDim, fontSize: '0.75rem', textAlign: 'center', margin: '8px 0' },
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
    fontSize: '0.9rem',
  },
  addBtn: {
    marginTop: 8,
    width: '100%',
    padding: '8px 0',
    borderRadius: 6,
    border: `1px dashed ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  addForm: { marginTop: 8, padding: 10, borderRadius: 8, background: colors.cardAlt },
};
