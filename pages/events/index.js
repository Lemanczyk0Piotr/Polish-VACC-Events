import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import TimeField from '../../components/TimeField';
import { supabase } from '../../lib/supabaseClient';
import { colors, shared, font, eventKindMeta, eventStatusMeta, formatDate, formatTimeZ } from '../../lib/theme';
import { useLang } from '../../lib/i18n';
import { useAdminMode, adminFetch } from '../../lib/adminMode';

const EMPTY_FORM = {
  title: '',
  kind: 'event',
  event_date: '',
  time_start: '',
  time_end: '',
  status: 'draft',
  category: '',
  notes: '',
  image_url: '',
  external_link: '',
};

export default function Events() {
  const { lang, t } = useLang();
  const { isAdmin, password } = useAdminMode();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultKind, setDefaultKind] = useState('event');
  const [discordBusyId, setDiscordBusyId] = useState(null);

  const load = () => {
    supabase
      .from('events')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setEvents(data || []);
      });
  };

  useEffect(load, []);

  // Non-admins can never see completed events — the toggle to reveal them
  // is admin-only (hidden below), and this filter enforces it regardless of
  // any stray state, since isAdmin can flip false mid-session (logout).
  const sorted = useMemo(() => {
    if (!events) return [];
    const list = isAdmin && showCompleted ? events : events.filter((e) => e.status !== 'completed');
    return [...list].sort((a, b) => {
      const da = `${a.event_date}T${a.time_start || '00:00:00'}`;
      const db = `${b.event_date}T${b.time_start || '00:00:00'}`;
      return da.localeCompare(db);
    });
  }, [events, showCompleted]);

  const openCreate = (kind) => {
    setEditing(null);
    setDefaultKind(kind);
    setModalOpen(true);
  };

  const openEdit = (ev) => {
    setEditing(ev);
    setDefaultKind(ev.kind);
    setModalOpen(true);
  };

  // Ręczne ogłoszenie wydarzenia na Discordzie. Backend prowadzi dziennik
  // wysyłek (discord_posts), więc drugie kliknięcie nie wyśle duplikatu —
  // zamiast tego odpowiada "skipped", a my dopiero wtedy pytamy admina, czy
  // na pewno chce ogłosić to samo wydarzenie ponownie (np. po poprawieniu
  // opisu) i powtarzamy żądanie z force=true.
  const announceOnDiscord = async (ev, force = false) => {
    if (!force && !confirm(t('events.discordConfirm', { title: ev.title }))) return;
    setDiscordBusyId(ev.id);
    try {
      const res = await adminFetch(password, '/api/discord/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'announce', event_id: ev.id, force }),
      });
      const data = await res.json();
      if (data?.skipped) {
        if (confirm(t('events.discordAgain'))) {
          setDiscordBusyId(null);
          return announceOnDiscord(ev, true);
        }
        return;
      }
      if (!res.ok) {
        alert(`${t('events.discordFailed')}\n${data.error || ''}`);
        return;
      }
      alert(t('events.discordOk'));
    } catch (e) {
      alert(t('events.discordFailed'));
    } finally {
      setDiscordBusyId(null);
    }
  };

  const handleDelete = async (ev) => {
    if (!confirm(t('events.confirmDelete', { title: ev.title }))) return;
    const res = await adminFetch(password, `/api/events/${ev.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else alert(t('events.deleteFailed'));
  };

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={shared.h1}>{t('events.title')}</h1>
          <p style={shared.sub}>
            {!events ? t('events.loading') : isAdmin ? t('events.count', { n: events.length }) : ''}
          </p>
        </div>
        {isAdmin && (
          <div style={styles.createBtns}>
            <button style={styles.createBtn(colors.red)} onClick={() => openCreate('event')}>
              {t('events.newEvent')}
            </button>
            <button style={styles.createBtn(colors.purple)} onClick={() => openCreate('exam')}>
              {t('events.newExam')}
            </button>
            <button style={styles.createBtn(colors.cyan)} onClick={() => openCreate('announcement')}>
              {t('events.newAnnouncement')}
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <button style={styles.toggleBtn} onClick={() => setShowCompleted((v) => !v)}>
          {showCompleted ? t('events.showingCompleted') : t('events.showCompleted')}
        </button>
      )}

      {error && <p style={{ color: colors.red }}>{error}</p>}

      <div style={styles.list}>
        {sorted.map((ev) => {
          const meta = eventKindMeta[ev.kind] || eventKindMeta.event;
          const statusMeta = eventStatusMeta[ev.status] || eventStatusMeta.draft;
          return (
            <div key={ev.id} style={styles.card(meta.color)}>
              {ev.image_url && <img src={ev.image_url} alt="" style={styles.thumb} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.cardTop}>
                  <span style={shared.badge(meta.color, meta.bg)}>{meta.label}</span>
                  <span style={shared.badge(statusMeta.color, 'transparent')}>{statusMeta.label}</span>
                  {ev.category && <span style={styles.categoryTag}>{ev.category}</span>}
                </div>
                <div style={styles.cardTitle}>{ev.title}</div>
                <div style={styles.cardDate}>
                  {formatDate(ev.event_date, lang)}
                  {ev.time_start ? ` · ${formatTimeZ(ev.time_start)}` : ''}
                  {ev.time_end ? `–${formatTimeZ(ev.time_end)}` : ''}
                </div>
                {ev.notes && <div style={styles.cardNotes}>{ev.notes}</div>}
              </div>
              <div style={styles.cardActions}>
                {ev.kind === 'event' && (
                  <>
                    <Link href={`/events/${ev.id}`} style={styles.scheduleBtn}>
                      {t('events.signups')}
                    </Link>
                    <Link href={`/events/${ev.id}/stats`} style={styles.statsBtn}>
                      {t('events.stats')}
                    </Link>
                  </>
                )}
                {isAdmin && (
                  <>
                    <button
                      style={styles.discordBtn}
                      onClick={() => announceOnDiscord(ev)}
                      disabled={discordBusyId === ev.id}
                    >
                      {discordBusyId === ev.id ? t('events.discordBusy') : t('events.discordBtn')}
                    </button>
                    <button style={styles.editBtn} onClick={() => openEdit(ev)}>
                      {t('events.edit')}
                    </button>
                    <button style={styles.deleteBtn} onClick={() => handleDelete(ev)}>
                      {t('events.delete')}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && events && (
          <p style={{ color: colors.mutedDim }}>{t('events.noEntries')}</p>
        )}
      </div>

      {modalOpen && (
        <EventFormModal
          initial={editing}
          defaultKind={defaultKind}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </Layout>
  );
}

function EventFormModal({ initial, defaultKind, onClose, onSaved }) {
  const { t } = useLang();
  const { password } = useAdminMode();
  const [form, setForm] = useState(() =>
    initial
      ? {
          title: initial.title || '',
          kind: initial.kind || 'event',
          event_date: initial.event_date || '',
          time_start: initial.time_start ? initial.time_start.slice(0, 5) : '',
          time_end: initial.time_end ? initial.time_end.slice(0, 5) : '',
          status: initial.status || 'draft',
          category: initial.category || '',
          notes: initial.notes || '',
          image_url: initial.image_url || '',
          external_link: initial.external_link || '',
        }
      : { ...EMPTY_FORM, kind: defaultKind }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const needsEnd = form.kind === 'event';

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.event_date) {
      setErr(t('events.validationTitleDate'));
      return;
    }
    setSaving(true);
    setErr(null);
    const payload = {
      title: form.title.trim(),
      kind: form.kind,
      event_date: form.event_date,
      time_start: form.time_start ? `${form.time_start}:00` : null,
      time_end: needsEnd && form.time_end ? `${form.time_end}:00` : null,
      status: form.status,
      category: form.category || null,
      notes: form.notes || null,
      image_url: form.image_url || null,
      external_link: form.external_link || null,
    };
    const url = initial ? `/api/events/${initial.id}` : '/api/events';
    const method = initial ? 'PUT' : 'POST';
    try {
      const res = await adminFetch(password, url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('events.saveError'));
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const meta = eventKindMeta[form.kind] || eventKindMeta.event;

  return (
    <div style={shared.modalOverlay} onClick={onClose}>
      <form style={shared.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ ...shared.h1, color: meta.color }}>
          {initial ? t('events.modalEditTitle') : t('events.modalNewTitle', { label: meta.label })}
        </h2>

        <div style={styles.kindRow}>
          {Object.entries(eventKindMeta).map(([k, m]) => (
            <button
              type="button"
              key={k}
              onClick={() => setForm((f) => ({ ...f, kind: k }))}
              style={{
                ...styles.kindPill,
                borderColor: m.color,
                color: form.kind === k ? '#fff' : m.color,
                background: form.kind === k ? m.color : 'transparent',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Field label={t('events.fieldTitle')}>
          <input style={shared.input} value={form.title} onChange={set('title')} />
        </Field>

        <div style={styles.row2}>
          <Field label={t('events.fieldDate')}>
            <input type="date" style={shared.input} value={form.event_date} onChange={set('event_date')} />
          </Field>
          <Field label={t('events.fieldStart')}>
            <TimeField value={form.time_start} onChange={(v) => setForm((f) => ({ ...f, time_start: v }))} />
          </Field>
          {needsEnd && (
            <Field label={t('events.fieldEnd')}>
              <TimeField value={form.time_end} onChange={(v) => setForm((f) => ({ ...f, time_end: v }))} />
            </Field>
          )}
        </div>

        <div style={styles.row2}>
          <Field label={t('events.fieldStatus')}>
            <select style={shared.input} value={form.status} onChange={set('status')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
          <Field label={t('events.fieldCategory')}>
            <input style={shared.input} value={form.category} onChange={set('category')} placeholder={t('events.categoryPlaceholder')} />
          </Field>
        </div>

        <Field label={t('events.fieldBanner')}>
          <input style={shared.input} value={form.image_url} onChange={set('image_url')} placeholder="https://…" />
        </Field>

        <Field label={t('events.fieldExternalLink')}>
          <input style={shared.input} value={form.external_link} onChange={set('external_link')} placeholder="https://…" />
        </Field>

        <Field label={t('events.fieldNotes')}>
          <textarea style={{ ...shared.input, minHeight: 80, resize: 'vertical' }} value={form.notes} onChange={set('notes')} />
        </Field>

        {err && <p style={{ color: colors.red, fontSize: '0.85rem' }}>{err}</p>}

        <div style={styles.modalActions}>
          <button type="button" style={shared.btnGhost} onClick={onClose}>
            {t('events.cancel')}
          </button>
          <button type="submit" style={shared.btnPrimary} disabled={saving}>
            {saving ? t('events.saving') : t('events.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </label>
  );
}

const styles = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  createBtns: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  createBtn: (color) => ({
    padding: '11px 16px',
    borderRadius: 8,
    border: `1px solid ${color}`,
    background: 'transparent',
    color,
    fontWeight: 700,
    fontSize: '0.85rem',
    letterSpacing: '0.02em',
    cursor: 'pointer',
  }),
  toggleBtn: {
    ...shared.btnGhost,
    marginBottom: 20,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: (color) => ({
    display: 'flex',
    gap: 20,
    padding: 18,
    borderRadius: 12,
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderLeft: `4px solid ${color}`,
    alignItems: 'center',
    flexWrap: 'wrap',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.04)',
  }),
  thumb: {
    width: 340,
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: 8,
    flexShrink: 0,
    background: colors.cardAlt,
  },
  cardTop: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' },
  categoryTag: { fontSize: '0.8rem', color: colors.mutedDim },
  cardTitle: { fontSize: '1.3rem', fontWeight: 700, marginBottom: 4, fontFamily: font.display },
  cardDate: { fontSize: '0.9rem', color: colors.muted, fontFamily: 'monospace' },
  cardNotes: { fontSize: '0.9rem', color: colors.mutedDim, marginTop: 6, maxWidth: 560 },
  // Przyciski jedna pod drugą (user, 2026-09-02) — w poziomie zjadały
  // szerokość karty i przy 5 akcjach zawijały się nierówno. `stretch` daje im
  // wspólną szerokość, więc kolumna wygląda jak lista akcji, a nie jak
  // przypadkowe klocki.
  cardActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    flexShrink: 0,
    marginLeft: 'auto',
    minWidth: 170,
  },
  scheduleBtn: {
    textAlign: 'center',
    padding: '14px 24px',
    borderRadius: 9,
    border: `1px solid ${colors.amber}`,
    background: colors.amberBg,
    color: colors.amber,
    fontWeight: 700,
    fontSize: '1rem',
    textDecoration: 'none',
  },
  statsBtn: {
    textAlign: 'center',
    padding: '13px 20px',
    borderRadius: 9,
    border: `1px solid ${colors.border}`,
    background: colors.cardAlt,
    color: colors.text,
    fontWeight: 700,
    fontSize: '0.95rem',
    letterSpacing: '0.02em',
    textDecoration: 'none',
  },
  // Kolor Discorda (blurple #5865F2) — od razu widać, że przycisk wychodzi
  // poza aplikację, a nie edytuje wydarzenie.
  discordBtn: {
    padding: '13px 20px',
    borderRadius: 9,
    border: '1px solid #5865F2',
    background: 'rgba(88, 101, 242, 0.12)',
    color: '#4752C4',
    fontWeight: 700,
    fontSize: '0.95rem',
    letterSpacing: '0.02em',
    cursor: 'pointer',
  },
  editBtn: {
    padding: '13px 20px',
    borderRadius: 9,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontWeight: 600,
    fontSize: '0.95rem',
    letterSpacing: '0.02em',
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '13px 20px',
    borderRadius: 9,
    border: `1px solid ${colors.red}`,
    background: colors.redBg,
    color: colors.red,
    fontWeight: 700,
    fontSize: '0.95rem',
    cursor: 'pointer',
  },
  kindRow: { display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  kindPill: {
    padding: '7px 16px',
    borderRadius: 20,
    border: '1px solid',
    fontWeight: 700,
    fontSize: '0.8rem',
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  fieldLabel: { fontSize: '0.8rem', color: colors.muted, marginBottom: 6, letterSpacing: '0.03em' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
};
