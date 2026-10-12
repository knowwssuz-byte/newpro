import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rpcError(error) {
  const message = String(error?.message || '');
  if (message.includes('USER_BANNED')) return ['Siz bloklangansiz', 403];
  if (message.includes('GIFT_NOT_FOUND')) return ['Yutuq topilmadi', 404];
  if (message.includes('ALREADY_SOLD')) return ['Bu sovg‘a allaqachon sotilgan', 409];
  if (message.includes('WITHDRAW_ALREADY_REQUESTED')) return ['Yechishga yuborilgan sovg‘ani sotib bo‘lmaydi', 409];
  if (message.includes('BALANCE_REWARD')) return ['Balance reward sotilmaydi', 400];
  if (message.includes('PRICE_NOT_SET')) return ['Bu sovg‘a uchun sotish narxi kiritilmagan', 400];
  if (error?.code === 'PGRST202') return ['Sovg‘a savdosi uchun SQL migratsiya o‘rnatilmagan', 503];
  console.error('Atomic sale failed', { code: error?.code });
  return ['Sovg‘ani sotishda server xatosi', 500];
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const { historyId } = auth.body || {};
    if (!/^[0-9a-f-]{36}$/i.test(String(historyId || ''))) return jsonError('historyId noto‘g‘ri', 400);
    const dbUser = await ensureUser(auth.telegramUser);
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz', 403);

    const { data, error } = await getSupabaseAdmin().rpc('sell_gift_atomic', {
      p_user_id: Number(auth.telegramUser.id),
      p_history_id: historyId,
    });
    if (error) {
      const [message, status] = rpcError(error);
      return jsonError(message, status);
    }
    return Response.json({
      ok: true,
      user: { ...dbUser, balance: Number(data.balance) },
      balance: Number(data.balance),
      salePrice: Number(data.salePrice),
      history: data.history,
    });
  } catch (error) {
    console.error('Sell gift route failed', { message: error?.message });
    return jsonError('Server xatosi', 500);
  }
}
