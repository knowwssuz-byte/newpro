import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// Server-only and idempotent at the database layer. The signup INSERT trigger
// creates exactly one notice; duplicate /start or bootstrap calls cannot queue more.
const ADMIN_CHAT_ID = 7690148385;

export async function sendSignupNotice(user) {
  const id = Number(user?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const db = getSupabaseAdmin();
  const { data: claimed, error } = await db.rpc('claim_newpro_signup', { p_user_id: id });
  if (error) {
    console.error('[signup-notice:claim]', error.code || 'unknown');
    return;
  }
  if (claimed !== true) return;
  const display = String(user.first_name || 'Noma’lum').replace(/[<>\u0000-\u001f]/g, '').slice(0, 70);
  const username = /^[a-zA-Z0-9_]{5,32}$/.test(user.username || '') ? '@' + user.username : 'ko‘rsatilmagan';
  const text = [
    '🟣 NEWPRO · Yangi obunachi',
    '',
    '👤 ' + display,
    '🔗 ' + username,
    '🆔 Telegram ID: ' + id,
    '🕒 ' + new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }),
    '',
    '📊 https://newpro-blue.vercel.app/onlines?user=' + id
  ].join('\n');
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('Bot token sozlanmagan');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5500);
    let response;
    try {
      response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, disable_web_page_preview: true }),
        signal: controller.signal,
        cache: 'no-store',
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok || (await response.json().catch(() => null))?.ok !== true) {
      throw new Error('Telegram sendMessage javob kodi: ' + response.status);
    }
    const { error: saveError } = await db.from('signup_notice_outbox')
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq('user_id', id).is('sent_at', null);
    if (saveError) throw saveError;
  } catch (err) {
    console.error('[signup-notice:send]', String(err?.message || err).slice(0,100));
    await db.from('signup_notice_outbox')
      .update({ claimed_at: null, last_error: String(err?.message || 'send failed').slice(0,150) })
      .eq('user_id', id).is('sent_at', null);
  }
}
