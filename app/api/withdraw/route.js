import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rpcError(error) {
  const message = String(error?.message || '');
  if (message.includes('USER_BANNED')) return ['Siz bloklangansiz', 403];
  if (message.includes('GIFT_NOT_FOUND')) return ['Yutuq topilmadi', 404];
  if (message.includes('ALREADY_SOLD')) return ['Sotilgan sovg‘ani yechib bo‘lmaydi', 409];
  if (message.includes('WITHDRAW_ALREADY_REQUESTED') || error?.code === '23505')
    return ['Bu yutuq uchun so‘rov allaqachon yuborilgan', 409];
  if (message.includes('BALANCE_REWARD')) return ['Balance reward avtomatik balansga qo‘shiladi', 400];
  if (error?.code === 'PGRST202') return ['Withdrawal uchun SQL migratsiya o‘rnatilmagan', 503];
  console.error('Atomic withdrawal failed', { code: error?.code });
  return ['Yutuqni yechishga yuborishda server xatosi', 500];
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const { historyId } = auth.body || {};
    if (!/^[0-9a-f-]{36}$/i.test(String(historyId || ''))) return jsonError('historyId noto‘g‘ri', 400);
    const dbUser = await ensureUser(auth.telegramUser);
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz', 403);
    const { data, error } = await getSupabaseAdmin().rpc('request_gift_withdrawal_atomic', {
      p_user_id: Number(auth.telegramUser.id),
      p_history_id: historyId,
    });
    if (error) {
      const [message, status] = rpcError(error);
      return jsonError(message, status);
    }
    return Response.json({ ok: true, request: data });
  } catch (error) {
    console.error('Withdraw route failed', { message: error?.message });
    return jsonError('Server xatosi', 500);
  }
}
