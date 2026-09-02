import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';
import { colors, shared, RATING_RANK, endorsementBadges } from '../lib/theme';
import { useLang } from '../lib/i18n';
import { useAdminMode, adminFetch } from '../lib/adminMode';

const ENDORSEMENT_OPTIONS = ['PE', 'S2-CE', 'S3-CE', 'C1-CE'];

function formatRosterUntil(iso, lang) {
  if (!iso) return null;
  const locale = lang === 'en' ? 'en-GB' : 'pl-PL';
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Roster() {
  const { lang, t } = useLang();
  const { isAdmin, password } = useAdminMode();
  const [controllers, setControllers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [editing, setEditing] = useState(null);

  const loadControllers = () => {
    supabase
      .from('controllers')
      .select('*')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setControllers(data);
      });
  };

  useEffect(loadControllers, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await adminFetch(password, '/api/sync/roster', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('roster.syncError'));
      setSyncMsg(t('roster.syncSuccess', { n: data.synced, deactivated: data.deactivated || 0 }));
      loadControllers();
    } catch (err) {
      setSyncMsg(t('roster.syncErrorMsg', { msg: err.message }));
    } finally {
      setSyncing(false);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredSorted = useMemo(() => {
    if (!controllers) return [];
    const q = search.trim().toLowerCase();
    let list = controllers.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.cid || '').toLowerCase().includes(q) ||
        (c.rating || '').toLowerCase().includes(q)
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      // Inactive always last, regardless of sort.
      const aInactive = a.status === 'inactive';
      const bInactive = b.status === 'inactive';
      if (aInactive !== bInactive) return aInactive ? 1 : -1;
      // OBS rating always after everyone else within active/visitor.
      const aObs = a.rating === 'OBS';
      const bObs = b.rating === 'OBS';
      if (aObs !== bObs) return aObs ? 1 : -1;

      if (sortKey === 'cid') return dir * (Number(a.cid || 0) - Number(b.cid || 0));
      if (sortKey === 'rating') {
        const ra = RATING_RANK[a.rating] ?? -1;
        const rb = RATING_RANK[b.rating] ?? -1;
        return dir * (rb - ra);
      }
      return dir * a.name.localeCompare(b.name);
    });
    return list;
  }, [controllers, search, sortKey, sortDir]);

  const activeCount = controllers?.filter((c) => c.status !== 'inactive').length;

  const sortArrow = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={shared.h1}>{t('roster.title')}</h1>
          <p style={shared.sub}>
            {controllers ? t('roster.count', { n: activeCount }) : t('roster.loading')}
          </p>
        </div>
        {isAdmin && (
          <div style={{ textAlign: 'right' }}>
            <button onClick={handleSync} disabled={syncing} style={shared.btnPrimary}>
              {syncing ? t('roster.syncing') : t('roster.syncNow')}
            </button>
            {syncMsg && <div style={styles.syncMsg}>{syncMsg}</div>}
          </div>
        )}
      </div>

      <input
        type="text"
        placeholder={t('roster.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...shared.input, width: '100%', maxWidth: 480, marginBottom: 24, display: 'block' }}
      />

      {error && <p style={{ color: colors.red }}>{error}</p>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th} onClick={() => toggleSort('name')}>
                {t('roster.colName')}{sortArrow('name')}
              </th>
              <th style={styles.th} onClick={() => toggleSort('cid')}>
                {t('roster.colCid')}{sortArrow('cid')}
              </th>
              <th style={styles.th} onClick={() => toggleSort('rating')}>
                {t('roster.colRating')}{sortArrow('rating')}
              </th>
              <th style={styles.th}>{t('roster.colStatus')}</th>
              {isAdmin && <th style={styles.th}></th>}
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((c) => (
              <tr key={c.id} style={{ ...styles.tr, opacity: c.status === 'inactive' ? 0.5 : 1 }}>
                <td style={styles.td}>
                  {c.name}
                  {c.is_mentor && <span style={shared.badge(colors.blue, colors.blueBg)}>{t('roster.mentorBadge')}</span>}
                </td>
                <td style={styles.td}>{c.cid || '—'}</td>
                <td style={styles.td}>
                  {c.rating && <span style={shared.badge(colors.blue, colors.blueBg)}>{c.rating}</span>}{' '}
                  {endorsementBadges(c).map((b) => (
                    <span key={b.label} style={{ ...shared.badge(b.color, b.bg), marginLeft: 4 }}>
                      {b.label}
                    </span>
                  ))}
                </td>
                <td style={styles.td}>
                  <span style={{ ...styles.statusDot, background: statusColor(c.status) }} /> {c.status}
                  {c.roster_until && (
                    <div style={styles.rosterUntil}>
                      {t('roster.activeUntil', { date: formatRosterUntil(c.roster_until, lang) })}
                    </div>
                  )}
                </td>
                {isAdmin && (
                  <td style={styles.td}>
                    <button style={shared.btnGhost} onClick={() => setEditing(c)}>
                      {t('roster.edit')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditControllerModal
          controller={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadControllers();
          }}
        />
      )}
    </Layout>
  );
}

function statusColor(status) {
  if (status === 'inactive') return colors.mutedDim;
  if (status === 'visitor') return colors.blue;
  return colors.green;
}

function EditControllerModal({ controller, onClose, onSaved }) {
  const { t } = useLang();
  const { password } = useAdminMode();
  const [status, setStatus] = useState(controller.status || 'active');
  const [isMentor, setIsMentor] = useState(!!controller.is_mentor);
  const [endorsements, setEndorsements] = useState(controller.endorsements || []);
  const [discordId, setDiscordId] = useState(controller.discord_id || '');
  const [saving, setSaving] = useState(false);

  const toggleEndorsement = (tag) =>
    setEndorsements((list) => (list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminFetch(password, `/api/controllers/${controller.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, is_mentor: isMentor, endorsements, discord_id: discordId }),
      });
      if (!res.ok) throw new Error(t('roster.saveError'));
      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={shared.modalOverlay} onClick={onClose}>
      <form style={shared.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={shared.h1}>{controller.name}</h2>
        <p style={shared.sub}>
          CID {controller.cid || '—'} · {controller.rating || '—'}
        </p>

        <div style={{ marginBottom: 16 }}>
          <div style={styles.fieldLabel}>{t('roster.fieldStatus')}</div>
          <select style={{ ...shared.input, width: '100%' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="visitor">Visitor</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <label style={styles.toggleRow}>
          <input type="checkbox" checked={isMentor} onChange={(e) => setIsMentor(e.target.checked)} />
          <span>{t('roster.mentorLabel')}</span>
        </label>

        <div style={{ marginTop: 16 }}>
          <div style={styles.fieldLabel}>{t('roster.endorsements')}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {ENDORSEMENT_OPTIONS.map((tag) => (
              <label key={tag} style={styles.toggleRow}>
                <input type="checkbox" checked={endorsements.includes(tag)} onChange={() => toggleEndorsement(tag)} />
                <span>{tag}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={styles.fieldLabel}>{t('roster.discordId')}</div>
          <input
            style={{ ...shared.input, width: '100%', fontFamily: 'monospace' }}
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="np. 123456789012345678"
          />
          <div style={{ fontSize: '0.78rem', color: colors.mutedDim, marginTop: 6, lineHeight: 1.5 }}>
            {t('roster.discordIdHint')}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button type="button" style={shared.btnGhost} onClick={onClose}>
            {t('roster.cancel')}
          </button>
          <button type="submit" style={shared.btnPrimary} disabled={saving}>
            {saving ? t('roster.saving') : t('roster.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  syncMsg: { marginTop: 6, fontSize: '0.85rem', color: colors.muted, maxWidth: 260 },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: `1px solid ${colors.border}` },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '1rem' },
  th: {
    textAlign: 'left',
    padding: '13px 16px',
    color: colors.muted,
    fontWeight: 600,
    fontSize: '0.85rem',
    letterSpacing: '0.04em',
    borderBottom: `1px solid ${colors.border}`,
    background: colors.cardAlt,
    cursor: 'pointer',
    userSelect: 'none',
  },
  tr: { borderBottom: `1px solid ${colors.borderLight}` },
  td: { padding: '13px 16px' },
  statusDot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 6 },
  rosterUntil: { fontSize: '0.76rem', color: colors.mutedDim, marginTop: 2, marginLeft: 13 },
  fieldLabel: { fontSize: '0.8rem', color: colors.muted, marginBottom: 6, letterSpacing: '0.03em', fontWeight: 700 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', cursor: 'pointer' },
};
