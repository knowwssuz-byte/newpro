import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function upgradeError(error) {
  const message = String(error?.message || '');
  const known = {
    USER_NOT_FOUND: ['Foydalanuvchi topilmadi', 404],
    USER_BANNED: ['Akkauntingiz bloklangan', 403],
    UPGRADE_DISABLED: ['Upgrade hozircha yopiq', 503],
    SOURCE_NOT_FOUND: ['Bu sovg‘a inventaringizda yo‘q', 404],
    SOURCE_ALREADY_USED: ['Bu sovg‘a allaqachon ishlatilgan', 409],
    SOURCE_RESERVED: ['Sovg‘a yechish jarayonida, uni upgrade qilib bo‘lmaydi', 409],
    SOURCE_NOT_GIFT: ['Faqat haqiqiy sovg‘alarni upgrade qilish mumkin', 400],
    SOURCE_PRICE_MISSING: ['Beriladigan sovg‘aning qiymati belgilanmagan', 400],
    TARGET_UNAVAILABLE: ['Tanlangan sovg‘a mavjud emas yoki omborda tugagan', 409],
    TARGET_NOT_HIGHER: ['Olinadigan sovg‘a qimmatroq bo‘lishi kerak', 400],
    CHANCE_TOO_LOW: ['Bu juftlik uchun yutish ehtimoli juda past', 400],
    REQUEST_ID_REUSED: ['Urinish identifikatori noto‘g‘ri takrorlangan', 409],
  };
  for (const [code, response] of Object.entries(known)) {
    if (message.includes(code)) return response;
  }
  if (error?.code === 'PGRST202') return ['Upgrade tizimi hali serverda sozlanmagan', 503];
  console.error('Upgrade transaction failed', { code: error?.code, message });
  return ['Upgrade yakunini olishda xatolik. Inventar tarixini yangilang.', 500];
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const { historyId, targetGiftId, requestId } = auth.body || {};
    if (![historyId, targetGiftId, requestId].every(value => UUID.test(String(value || '')))) {
      return jsonError('Urinish ma’lumotlari noto‘g‘ri', 400);
    }
    const user = await ensureUser(auth.telegramUser);
    if (user.is_banned) return jsonError('Siz bloklangansiz', 403);
    const { data, error } = await getSupabaseAdmin().rpc('upgrade_gift_atomic', {
      p_user_id: Number(auth.telegramUser.id),
      p_source_history_id: historyId,
      p_target_gift_id: targetGiftId,
      p_request_id: requestId,
    });
    if (error) {
      const [message, status] = upgradeError(error);
      return jsonError(message, status);
    }
    return Response.json({ ok: true, won: Boolean(data.won), chance: Number(data.chance),
      round: data.round, rewardHistoryId: data.rewardHistoryId, replayed: Boolean(data.replayed) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Upgrade request failed', { message: error?.message });
    return jsonError('Server xatosi', 500);
  }
}
