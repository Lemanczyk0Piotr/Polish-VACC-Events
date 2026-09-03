import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import TimeField from '../components/TimeField';
import { supabase } from '../lib/supabaseClient';
import { colors, shared, font, formatDate } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { useAdminMode, adminFetch } from '../lib/adminMode';

// Panel integracji z Discordem (admin-only). Trzy rzeczy w jednym miejscu:
//  1. STATUS — czy webhooki, ping roli i sekret crona są ustawione (sam URL
//     webhooka nigdy nie opuszcza serwera, patrz /api/discord/status),
//  2. MATERIAŁY — kolejka postów publikowanych o wyznaczonej dacie/godzinie,
//  3. DZIENNIK — co i kiedy poszło, żeby było widać, że automat działa.

const TARGET_LABELS = {
  events: 'Eventy / ogłoszenia',
  schedule: 'Rozpiski',
  materials: 'Materiały',
  summary: 'Podsumowania',
};

const KIND_LABELS = {
  event_announce: 'Ogłoszenie eventu',
  event_reminder_d1: 'Przypomnienie (1 dzień)',
  event_reminder_d2: 'Przypomnienie (2 dni)',
  event_schedule: 'Rozpiska',
  monthly_summary: 'Podsumowanie miesiąca',
  period_summary: 'Podsumowanie okresu',
  scheduled_post: 'Zaplanowany materiał',
  manual_reminder: 'Przypomnienie (ręczne)',
};

function kindLabel(kind) {
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  const signup = /^signup_reminder_d(\d+)$/.exec(kind);
  if (signup) return `Przypomnienie o zapisach (${signup[1]} dni)`;
  const rem = /^event_reminder_d(\d+)$/.exec(kind);
  if (rem) return `Przypomnienie (${rem[1]} dni)`;
  return kind;
}

const EMPTY_MATERIAL = {
  title: '',
  body: '',
  image_url: '',
  target: 'materials',
  event_id: '',
  date: '',
  time: '18:00',
  mention_role: false,
};

export default function DiscordPanel() {
  const { lang, t } = useLang();
  const { isAdmin, password } = useAdminMode();

  const [status, setStatus] = useState(null);
  const [materials, setMaterials] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(false);

  const load = () => {
    if (!password) return;
    adminFetch(password, '/api/discord/status')
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStatus(d)))
      .catch((e) => setError(e.message));
    adminFetch(password, '/api/scheduled-posts')
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setMaterials(d) : setError(d.error)))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [password]);

  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, event_date, kind, status')
      .order('event_date', { ascending: false })
      .limit(60)
      .then(({ data }) => setEvents(data || []));
  }, []);

  const send = async (label, body) => {
    setBusy(label);
    try {
      const res = await adminFetch(password, '/api/discord/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.skipped) alert(t('discord.alreadySent'));
      else if (!res.ok) alert(`${t('discord.sendFailed')}\n${data.error || ''}`);
      else alert(t('discord.sendOk'));
      load();
    } catch (e) {
      alert(`${t('discord.sendFailed')}\n${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runCron = async () => {
    setBusy('cron');
    try {
      const res = await adminFetch(password, '/api/cron/discord');
      const data = await res.json();
      if (!res.ok) {
        alert(`${t('discord.sendFailed')}\n${data.error || ''}`);
        return;
      }
      const lines = (data.results || []).map((r) => `${r.ok ? '✓' : '✗'} ${r.label}${r.error ? ` — ${r.error}` : ''}`);
      alert(
        [`Wysłane: ${data.sent}, nieudane: ${data.failed}`, ...(lines.length ? ['', ...lines] : ['', 'Nic nie było do wysłania.'])].join(
          '\n'
        )
      );
      load();
    } catch (e) {
      alert(`${t('discord.sendFailed')}\n${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const deleteMaterial = async (m) => {
    if (!confirm(t('discord.confirmDelete'))) return;
    await adminFetch(password, `/api/scheduled-posts/${m.id}`, { method: 'DELETE' });
    load();
  };

  const publishNow = async (m) => {
    setBusy(`material-${m.id}`);
    try {
      const res = await adminFetch(password, `/api/scheduled-posts/${m.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      const data = await res.json();
      if (!res.ok) alert(`${t('discord.sendFailed')}\n${data.error || ''}`);
      else alert(t('discord.sendOk'));
      load();
    } finally {
      setBusy(null);
    }
  };

  const upcoming = useMemo(
    () => events.filter((e) => e.status !== 'completed'),
    [events]
  );

  if (!isAdmin) {
    return (
      <Layout>
        <h1 style={shared.h1}>{t('discord.title')}</h1>
        <p style={shared.sub}>{t('discord.sub')}</p>
        <div style={shared.card}>
          <p style={{ color: colors.muted, margin: 0 }}>
            Ta sekcja jest dostępna wyłącznie w trybie administratora (ikonka kłódki w górnym pasku).
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 style={shared.h1}>{t('discord.title')}</h1>
      <p style={shared.sub}>{t('discord.sub')}</p>
      {error && <p style={{ color: colors.red }}>{error}</p>}

      {/* --- STATUS --------------------------------------------------- */}
      <div style={{ ...shared.card, marginBottom: 20 }}>
        <div style={styles.sectionTitle}>{t('discord.statusTitle')}</div>
        {!status ? (
          <p style={{ color: colors.muted }}>…</p>
        ) : (
          <>
            <div style={styles.channelGrid}>
              {Object.entries(status.targets || {}).map(([key, ok]) => (
                <div key={key} style={styles.channelCard(ok)}>
                  <div style={{ fontWeight: 700 }}>{TARGET_LABELS[key] || key}</div>
                  <div style={{ color: ok ? colors.green : colors.red, fontSize: '0.85rem', marginBottom: 8 }}>
                    {ok ? t('discord.configured') : t('discord.missing')}
                  </div>
                  <button
                    style={styles.smallBtn}
                    disabled={!ok || busy === `test-${key}`}
                    onClick={() => send(`test-${key}`, { type: 'test', target: key })}
                  >
                    {t('discord.testBtn')}
                  </button>
                </div>
              ))}
            </div>

            <div style={styles.metaRow}>
              <span>
                {t('discord.rolePing')}:{' '}
                <b style={{ color: status.role_ping ? colors.green : colors.mutedDim }}>
                  {status.role_ping ? t('discord.set') : t('discord.notSet')}
                </b>
              </span>
              <span>
                {t('discord.siteUrlLabel')}:{' '}
                <b style={{ color: status.site_url ? colors.green : colors.mutedDim }}>
                  {status.site_url || t('discord.notSet')}
                </b>
              </span>
              <span>
                {t('discord.cronSecret')}:{' '}
                <b style={{ color: status.cron_secret ? colors.green : colors.red }}>
                  {status.cron_secret ? t('discord.set') : t('discord.notSet')}
                </b>
              </span>
              <span>
                {t('discord.autoAnnounce')}:{' '}
                <b style={{ color: status.auto_announce ? colors.green : colors.mutedDim }}>
                  {status.auto_announce ? t('discord.on') : t('discord.off')}
                </b>
              </span>
            </div>

            <div style={{ ...styles.sectionTitle, marginTop: 18 }}>{t('discord.rules')}</div>
            <ul style={styles.rulesList}>
              <li>{t('discord.rulesReminder', { d: status.reminder_days })}</li>
              {/* rulesSignups usunięte razem z automatycznymi przypomnieniami
                  o zapisach (2026-09-03) — funkcja zapisów jest wyłączona. */}
              <li>{t('discord.rulesSchedule', { d: status.schedule_days_before })}</li>
              <li>{t('discord.rulesSummary')}</li>
              <li>{t('discord.rulesHour', { h: status.reminder_hour })}</li>
            </ul>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button style={shared.btnPrimary} onClick={runCron} disabled={busy === 'cron'}>
                {busy === 'cron' ? t('discord.runningCron') : t('discord.runCron')}
              </button>
              <button
                style={shared.btnGhost}
                onClick={() => send('summary', { type: 'summary' })}
                disabled={busy === 'summary'}
              >
                {t('discord.summaryBtn')}
              </button>
              <button style={shared.btnGhost} onClick={() => setReminderOpen(true)}>
                {t('discord.reminderBtn')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* --- MATERIAŁY ------------------------------------------------ */}
      <div style={{ ...shared.card, marginBottom: 20 }}>
        <div style={styles.headerRow}>
          <div style={styles.sectionTitle}>{t('discord.materialsTitle')}</div>
          <button
            style={shared.btnPrimary}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            {t('discord.newMaterial')}
          </button>
        </div>

        {!materials ? (
          <p style={{ color: colors.muted }}>…</p>
        ) : materials.length === 0 ? (
          <p style={{ color: colors.mutedDim }}>{t('discord.noMaterials')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {materials.map((m) => (
              <div key={m.id} style={styles.materialRow}>
                {m.image_url && <img src={m.image_url} alt="" style={styles.thumb} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={shared.badge(...statusColor(m.status))}>{t(`discord.status${cap(m.status)}`)}</span>
                    <span style={styles.targetTag}>{TARGET_LABELS[m.target] || m.target}</span>
                    {m.mention_role && <span style={styles.targetTag}>@rola</span>}
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{m.title || '(bez tytułu)'}</div>
                  <div style={{ color: colors.muted, fontSize: '0.85rem' }}>
                    {fmtStamp(m.publish_at, lang)}
                    {m.events ? ` · ${m.events.title}` : ''}
                  </div>
                  {m.error && <div style={{ color: colors.red, fontSize: '0.8rem' }}>{m.error}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    style={styles.smallBtn}
                    onClick={() => publishNow(m)}
                    disabled={busy === `material-${m.id}`}
                  >
                    {t('discord.sendNow')}
                  </button>
                  <button
                    style={styles.smallBtn}
                    onClick={() => {
                      setEditing(m);
                      setModalOpen(true);
                    }}
                  >
                    {t('discord.edit')}
                  </button>
                  <button style={{ ...styles.smallBtn, color: colors.red, borderColor: colors.red }} onClick={() => deleteMaterial(m)}>
                    {t('discord.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- DZIENNIK ------------------------------------------------- */}
      <div style={shared.card}>
        <div style={styles.sectionTitle}>{t('discord.logTitle')}</div>
        {!status?.recent?.length ? (
          <p style={{ color: colors.mutedDim }}>{t('discord.noLog')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {status.recent.map((p) => (
              <div key={p.id} style={styles.logRow}>
                <span style={{ color: p.status === 'sent' ? colors.green : colors.red, width: 16 }}>
                  {p.status === 'sent' ? '✓' : '✗'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {kindLabel(p.kind)}
                  {p.events?.title ? ` · ${p.events.title}` : ''}
                  {p.error ? ` — ${p.error}` : ''}
                </span>
                <span style={{ color: colors.mutedDim, fontFamily: font.mono, fontSize: '0.8rem' }}>
                  {fmtStamp(p.sent_at, lang)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {reminderOpen && (
        <ReminderModal
          events={upcoming}
          roles={status?.roles || []}
          onClose={() => setReminderOpen(false)}
          onSend={async (payload) => {
            setReminderOpen(false);
            await send('reminder', { type: 'reminder_ping', ...payload });
          }}
        />
      )}

      {modalOpen && (
        <MaterialModal
          initial={editing}
          events={upcoming}
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

// Ręczne przypomnienie: wybór wydarzenia, ról do pingnięcia i opcjonalnego
// tekstu. Role biorą się z listy zwróconej przez /api/discord/status — jeśli
// dana zmienna środowiskowa nie jest ustawiona, rola pojawia się jako
// niedostępna, zamiast po cichu nie pingnąć nikogo.
function ReminderModal({ events, roles, onClose, onSend }) {
  const { t } = useLang();
  const [eventId, setEventId] = useState(events[0]?.id || '');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState(() =>
    roles.filter((r) => r.isDefault && r.configured).map((r) => r.key)
  );

  const toggle = (key) =>
    setPicked((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  return (
    <div style={shared.modalOverlay} onClick={onClose}>
      <div style={shared.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.sectionTitle, marginBottom: 16 }}>{t('discord.reminderTitle')}</div>

        <label style={styles.label}>{t('discord.reminderEvent')}</label>
        <select style={{ ...shared.input, width: '100%' }} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {events.length === 0 && <option value="">{t('discord.reminderNoEvents')}</option>}
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.event_date} · {ev.title}
            </option>
          ))}
        </select>

        <label style={styles.label}>{t('discord.reminderRoles')}</label>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {roles.map((r) => (
            <label
              key={r.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: r.configured ? 'pointer' : 'not-allowed',
                opacity: r.configured ? 1 : 0.45,
              }}
              title={r.configured ? '' : t('discord.reminderRoleMissing')}
            >
              <input
                type="checkbox"
                checked={picked.includes(r.key)}
                disabled={!r.configured}
                onChange={() => toggle(r.key)}
              />
              <span>{r.label}</span>
            </label>
          ))}
        </div>

        <label style={styles.label}>{t('discord.reminderText')}</label>
        <textarea
          style={{ ...shared.input, width: '100%', minHeight: 90, fontFamily: 'inherit' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('discord.reminderTextPlaceholder')}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" style={shared.btnGhost} onClick={onClose}>
            {t('discord.cancel')}
          </button>
          <button
            type="button"
            style={shared.btnPrimary}
            disabled={!eventId}
            onClick={() => onSend({ event_id: eventId, roles: picked, text })}
          >
            {t('discord.reminderSend')}
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialModal({ initial, events, onClose, onSaved }) {
  const { t } = useLang();
  const { password } = useAdminMode();
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY_MATERIAL;
    const d = new Date(initial.publish_at);
    return {
      title: initial.title || '',
      body: initial.body || '',
      image_url: initial.image_url || '',
      target: initial.target || 'materials',
      event_id: initial.event_id || '',
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
      mention_role: Boolean(initial.mention_role),
    };
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date) {
      setErr('Podaj datę publikacji.');
      return;
    }
    setSaving(true);
    setErr(null);
    // Godzina jest w Zulu — tak jak każda inna godzina w aplikacji — więc
    // sklejamy ją z datą i jawnym "Z", zamiast polegać na strefie przeglądarki.
    const publish_at = `${form.date}T${form.time || '00:00'}:00Z`;
    const payload = {
      title: form.title || null,
      body: form.body || null,
      image_url: form.image_url || null,
      target: form.target,
      event_id: form.event_id || null,
      publish_at,
      mention_role: form.mention_role,
    };
    try {
      const res = await adminFetch(
        password,
        initial ? `/api/scheduled-posts/${initial.id}` : '/api/scheduled-posts',
        {
          method: initial ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Nie udało się zapisać.');
        return;
      }
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={shared.modalOverlay} onClick={onClose}>
      <form style={shared.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={{ ...styles.sectionTitle, marginBottom: 16 }}>{t('discord.materialsTitle')}</div>

        <label style={styles.label}>{t('discord.formTitle')}</label>
        <input style={{ ...shared.input, width: '100%' }} value={form.title} onChange={(e) => set('title', e.target.value)} />

        <label style={styles.label}>{t('discord.formBody')}</label>
        <textarea
          style={{ ...shared.input, width: '100%', minHeight: 120, fontFamily: 'inherit' }}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
        />

        <label style={styles.label}>{t('discord.formImage')}</label>
        <input
          style={{ ...shared.input, width: '100%' }}
          value={form.image_url}
          onChange={(e) => set('image_url', e.target.value)}
          placeholder="https://…"
        />

        <label style={styles.label}>{t('discord.formEvent')}</label>
        <select style={{ ...shared.input, width: '100%' }} value={form.event_id} onChange={(e) => set('event_id', e.target.value)}>
          <option value="">{t('discord.formNoEvent')}</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.event_date} · {ev.title}
            </option>
          ))}
        </select>

        <label style={styles.label}>{t('discord.formTarget')}</label>
        <select style={{ ...shared.input, width: '100%' }} value={form.target} onChange={(e) => set('target', e.target.value)}>
          {Object.entries(TARGET_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={styles.label}>{t('discord.formDate')}</label>
            <input type="date" style={shared.input} value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <label style={styles.label}>{t('discord.formTime')}</label>
            <TimeField value={form.time} onChange={(v) => set('time', v)} />
          </div>
        </div>

        <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.mention_role} onChange={(e) => set('mention_role', e.target.checked)} />
          {t('discord.formMention')}
        </label>

        {err && <p style={{ color: colors.red }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" style={shared.btnGhost} onClick={onClose}>
            {t('discord.cancel')}
          </button>
          <button type="submit" style={shared.btnPrimary} disabled={saving}>
            {saving ? t('discord.saving') : t('discord.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

function cap(s) {
  return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
}

function statusColor(status) {
  if (status === 'sent') return [colors.green, colors.greenBg];
  if (status === 'failed') return [colors.red, colors.redBg];
  return [colors.gold, colors.goldBg];
}

// Znaczniki czasu w całej aplikacji są zuluskie — pokazujemy je tak samo tutaj,
// żeby admin widział dokładnie to, czym operuje automat.
function fmtStamp(iso, lang) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(d.toISOString().slice(0, 10), lang)} · ${hh}:${mm}z`;
}

const styles = {
  sectionTitle: {
    fontFamily: font.mono,
    fontSize: '0.8rem',
    letterSpacing: '0.08em',
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 12,
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  channelGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  channelCard: (ok) => ({
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${ok ? colors.border : colors.red}`,
    background: colors.cardAlt,
  }),
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 24px',
    marginTop: 16,
    fontSize: '0.85rem',
    color: colors.muted,
  },
  rulesList: { margin: 0, paddingLeft: 18, color: colors.muted, fontSize: '0.88rem', lineHeight: 1.7 },
  materialRow: {
    display: 'flex',
    gap: 14,
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.cardAlt,
    flexWrap: 'wrap',
  },
  thumb: { width: 96, height: 54, objectFit: 'cover', borderRadius: 6, background: colors.card },
  targetTag: {
    fontFamily: font.mono,
    fontSize: '0.72rem',
    color: colors.mutedDim,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: 5,
    padding: '2px 6px',
  },
  smallBtn: {
    padding: '7px 12px',
    borderRadius: 7,
    border: `1px solid ${colors.border}`,
    background: 'transparent',
    color: colors.muted,
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  logRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontSize: '0.85rem',
    color: colors.text,
    padding: '4px 0',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  label: { display: 'block', fontSize: '0.8rem', color: colors.muted, margin: '14px 0 6px', fontWeight: 600 },
};
