import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAdmin } from '../../../lib/adminAuth';
import { postToDiscord, TARGETS } from '../../../lib/discord';
import {
  announceEvent,
  remindEvent,
  remindSignups,
  sendSchedule,
  sendMonthlySummary,
  sendPeriodSummary,
  sendManualReminder,
} from '../../../lib/discordDispatch';

// Ręczna wysyłka z panelu administratora — te same funkcje, których używa
// cron, więc wiadomość wygląda identycznie i tak samo zapisuje się w
// dzienniku discord_posts (czyli późniejszy automat już jej nie powtórzy).
//
// force=true pomija sprawdzenie duplikatu — do użycia, gdy admin świadomie
// chce wysłać coś drugi raz (np. po poprawieniu opisu eventu).
//
// Domyślny limit ciała żądania w Next.js to 1 MB — za mało, gdy w środku
// jedzie PNG rozpiski zakodowany base64 (event z wieloma pozycjami potrafi
// dać kilka MB). Discord i tak przyjmie plik do 25 MB, ale 8 MB z zapasem
// wystarczy na każdy realny harmonogram.
export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const {
    type,
    event_id,
    days = 1,
    year,
    month,
    target = 'events',
    force = false,
    image_base64,
    remarks,
    from,
    to,
    only_completed,
    roles,
    text,
  } = req.body || {};
  const supabase = getSupabaseAdmin();

  try {
    let result;
    switch (type) {
      case 'test':
        if (!TARGETS.includes(target)) return res.status(400).json({ error: 'Nieznany kanał.' });
        result = await postToDiscord(target, {
          embeds: [
            {
              title: 'Test integracji PLVACC Events',
              description:
                'Jeśli widzisz tę wiadomość, webhook dla tego kanału jest poprawnie skonfigurowany.',
              color: 0xd32f2f,
              footer: { text: 'Polish VACC · TEST' },
              timestamp: new Date().toISOString(),
            },
          ],
        });
        break;
      case 'announce':
        if (!event_id) return res.status(400).json({ error: 'Brak event_id.' });
        result = await announceEvent(supabase, event_id, { force });
        break;
      case 'reminder':
        if (!event_id) return res.status(400).json({ error: 'Brak event_id.' });
        result = await remindEvent(supabase, event_id, Number(days) || 1, { force });
        break;
      case 'signups':
        if (!event_id) return res.status(400).json({ error: 'Brak event_id.' });
        result = await remindSignups(supabase, event_id, Number(days) || 5, { force });
        break;
      case 'schedule':
        if (!event_id) return res.status(400).json({ error: 'Brak event_id.' });
        // Uwagi zapisujemy przy evencie, zanim pójdzie wysyłka — dzięki temu
        // przetrwają do kolejnego otwarcia strony i trafią też do rozpiski
        // wysłanej automatem, który czyta je z bazy.
        if (typeof remarks === 'string') {
          await supabase
            .from('events')
            .update({ schedule_remarks: remarks.trim() || null, updated_at: new Date().toISOString() })
            .eq('id', event_id);
        }
        // image_base64 przychodzi ze strony eventu — to wykres Gantta
        // narysowany w przeglądarce (lib/scheduleImage.js). Może być podany
        // jako czysty base64 albo jako data URL; obcinamy ewentualny prefiks.
        result = await sendSchedule(supabase, event_id, {
          force,
          imageBase64: image_base64 ? String(image_base64).replace(/^data:[^,]+,/, '') : null,
        });
        break;
      case 'reminder_ping':
        if (!event_id) return res.status(400).json({ error: 'Brak event_id.' });
        result = await sendManualReminder(supabase, {
          eventId: event_id,
          roleKeys: Array.isArray(roles) ? roles : ['controllers'],
          text: typeof text === 'string' ? text : '',
        });
        break;
      case 'period':
        result = await sendPeriodSummary(supabase, {
          from,
          to,
          onlyCompleted: only_completed !== false,
          force,
        });
        break;
      case 'summary': {
        const now = new Date();
        const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        result = await sendMonthlySummary(supabase, {
          year: Number(year) || prev.getUTCFullYear(),
          month: Number(month) || prev.getUTCMonth() + 1,
          force,
        });
        break;
      }
      default:
        return res.status(400).json({ error: 'Nieznany typ wysyłki.' });
    }

    if (result?.skipped) {
      return res.status(200).json({
        ...result,
        message: 'Ta wiadomość została już wcześniej wysłana — użyj opcji „wyślij mimo wszystko”.',
      });
    }
    if (result && result.ok === false) {
      return res.status(502).json(result);
    }
    return res.status(200).json(result || { ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
