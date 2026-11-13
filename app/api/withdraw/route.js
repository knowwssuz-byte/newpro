import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';
import { enforceRate } from '@/lib/security/rateLimit';
import { sendMessage, buildMainKeyboard, getAdminIds } from '@/lib/telegramBot';
import { validateWithdrawalRecipient, normalizeTelegramUsername } from '@/lib/withdrawRecipient.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcError(error) {
  const message = String(error?.message || '');
  if (message.includes('USER_BANNED')) return ['Siz bloklangansiz', 403];
  if (message.includes('GIFT_NOT_FOUND')) return ['Yutuq topilmadi yoki bu gift sizniki emas', 404];
  if (message.includes('ALREADY_SOLD')) return ['Sotilgan giftni yechib bo‘lmaydi', 409];
  if (message.includes('ALREADY_UPGRADED')) return ['Upgrade qilingan giftni yechib bo‘lmaydi', 409];
  if (message.includes('GIFT_LOCKED_IN_GAME')) return ['O‘yinda band qilingan giftni yechib bo‘lmaydi', 409];
  if (message.includes('WITHDRAW_ALREADY_REQUESTED') || error?.code === '23505')
    return ['Bu gift uchun faol yechish so‘rovi allaqachon mavjud', 409];
  if (message.includes('RECIPIENT_MODE_INVALID') || message.includes('WITHDRAW_RECIPIENT_REQUIRED'))
    return ['Kimga yuborishni tanlang', 400];
  if (message.includes('RECIPIENT_USERNAME_INVALID'))
    return ['To‘g‘ri Telegram @username kiriting', 400];
  if (message.includes('BALANCE_REWARD')) return ['Stars mukofoti balansga avtomatik qo‘shiladi', 400];
  if (error?.code === 'PGRST202') return ['Yechish tizimi SQL yangilanishi topilmadi', 503];
  console.error('[withdraw]', error?.code || 'atomic_failed');
  return ['Yechish so‘rovini yuborib bo‘lmadi', 500];
}

async function notifyOfWithdrawal(requester, row, supabase) {
  try {
    const { data } = await supabase.from('gifts').select('title').eq('id', row.gift_id).maybeSingle();
    const requesterId = requester.id;
    const recipient = '@' + row.recipient_username;
    const label = row.recipient_mode === 'self' ? 'O‘ziga' : 'Boshqaga';
    const adminText =
      '🎁 <b>Yangi gift yechish so‘rovi</b>\n\n' +
      '<b>Gift:</b> ' + String(data?.title || 'Gift').replace(/[<>&]/g, '') + '\n' +
      '<b>Yuboruvchi user ID:</b> <code>' + requesterId + '</code>\n' +
      '<b>Yuboruvchi:</b> ' + (normalizeTelegramUsername(requester.username) ? '@' + requester.username : 'Username mavjud emas') + '\n' +
      '<b>Yo‘nalish:</b> ' + label + '\n' +
      '<b>Qabul qiluvchi:</b> ' + recipient + '\n' +
      (row.recipient_source !== 'telegram' ? '⚠️ Username qo‘lda kiritilgan. Yuborishdan oldin tekshiring.\n' : '') +
      '\nAdmin panelda yetkazishni tekshiring.';
    const targets = [...new Set(getAdminIds().filter((id) => /^\d+$/.test(id)))];
    await Promise.allSettled(targets.map((id) => sendMessage(Number(id), adminText)));
    await sendMessage(Number(requesterId),
      '✅ <b>Yechish so‘rovingiz qabul qilindi!</b>\n\n' +
      'Yo‘nalish: <b>' + label + '</b>\n' +
      'Qabul qiluvchi: <b>' + recipient + '</b>\n\n' +
      'Giftni admin tekshiradi. Holatini Inventory → Pending bo‘limida kuzating.',
      { reply_markup: buildMainKeyboard() }).catch(() => {});
  } catch (error) {
    // Delivery notifications cannot undo an already-committed withdrawal.
    console.error('[withdraw:notification]', error?.code || 'unavailable');
  }
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const action = String(auth.body?.action || 'submit');
    const dbUser = await ensureUser(auth.telegramUser);
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz', 403);
    const supabase = getSupabaseAdmin();

    if (action === 'draft') {
      const { data, error } = await supabase.from('withdraw_username_prompts')
        .select('reply_username,replied_at,expires_at')
        .eq('user_id', Number(auth.telegramUser.id)).maybeSingle();
      if (error) throw error;
      const active = data && new Date(data.expires_at).getTime() > Date.now();
      return Response.json({
        ok: true,
        username: active ? normalizeTelegramUsername(data.reply_username) : '',
        hasReply: Boolean(active && data.reply_username),
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (action === 'prompt_username') {
      if (normalizeTelegramUsername(auth.telegramUser.username)) {
        return Response.json({ ok: true, username: auth.telegramUser.username, alreadyAvailable: true });
      }
      await enforceRate('withdraw-username-prompt', String(auth.telegramUser.id), 2, 3600);
      const { error } = await supabase.from('withdraw_username_prompts').upsert({
        user_id: Number(auth.telegramUser.id),
        awaiting_reply: true,
        reply_username: null,
        replied_at: null,
        requested_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      try {
        await sendMessage(Number(auth.telegramUser.id),
          '🎁 <b>Giftni yechish — Telegram username</b>\n\n' +
          'Telegram profilingizda @username ko‘rsatilmagan.\n' +
          'Iltimos, gift qabul qiladigan akkauntning <b>@username</b>ini shu chatga yuboring.\n\n' +
          'Masalan: <code>@username123</code>\n\n' +
          'Keyin Web App → Inventory → Yechish oynasida <b>Botdan olish</b> tugmasini bosing.\n' +
          '⚠️ Gift kimga yuborilishini admin tekshiradi. Telegram kodingizni hech kimga bermang.\n\n' +
          'Bu so‘rov 30 daqiqa amal qiladi.',
          { reply_markup: { force_reply: true, input_field_placeholder: '@username' } });
        return Response.json({ ok: true, prompted: true });
      } catch {
        return jsonError('Botga xabar yuborilmadi. Botda /start bosing yoki username-ni shu oynaga kiriting.', 409);
      }
    }

    if (action !== 'submit') return jsonError('Noma’lum action', 400);
    const { historyId, recipientMode, recipientUsername } = auth.body || {};
    if (!UUID.test(String(historyId || ''))) return jsonError('historyId noto‘g‘ri', 400);

    const validated = validateWithdrawalRecipient({
      mode: recipientMode,
      username: recipientUsername,
      verifiedUsername: auth.telegramUser.username,
    });
    if (!validated.ok) return jsonError(validated.error, 400);

    const { data, error } = await supabase.rpc('request_gift_withdrawal_atomic', {
      p_user_id: Number(auth.telegramUser.id),
      p_history_id: historyId,
      p_recipient_mode: validated.mode,
      p_requested_username: validated.username,
      p_verified_username: normalizeTelegramUsername(auth.telegramUser.username),
    });
    if (error) {
      const [message, status] = rpcError(error);
      return jsonError(message, status);
    }
    // Fire-and-forget would be killed on serverless runtimes; await safely.
    await notifyOfWithdrawal(auth.telegramUser, data, supabase);
    return Response.json({ ok: true, request: data }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[withdraw]', error?.code || 'route_failed');
    if (error?.status) return jsonError(error.message, error.status);
    return jsonError('Server xatosi', 500);
  }
}
