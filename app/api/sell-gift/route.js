import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function rewardType(gift) {
  return String(gift?.type || '').toLowerCase() === 'balance' ? 'balance' : 'gift';
}

function sellPrice(gift) {
  const price = toNumber(gift?.sell_price ?? gift?.buy_price ?? gift?.floor_price ?? gift?.price ?? gift?.value, 0);

  return Math.max(0, price);
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);

    const supabase = getSupabaseAdmin();
    const dbUser = await ensureUser(auth.telegramUser);
    const { historyId } = auth.body || {};

    if (!historyId) return jsonError('historyId kerak');
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz', 403);

    const { data: history, error: historyError } = await supabase
      .from('open_history')
      .select('*')
      .eq('id', historyId)
      .eq('user_id', Number(auth.telegramUser.id))
      .single();

    if (historyError || !history) {
      return jsonError('Yutuq topilmadi', 404);
    }

    if (history.sold_at) {
      return jsonError('Bu sovg‘a allaqachon sotilgan', 400);
    }

    const { data: gift, error: giftError } = await supabase
      .from('gifts')
      .select('*')
      .eq('id', history.gift_id)
      .single();

    if (giftError || !gift) {
      return jsonError('Sovg‘a topilmadi', 404);
    }

    if (rewardType(gift) === 'balance') {
      return jsonError('Balance reward sotilmaydi', 400);
    }

    const price = sellPrice(gift);

    if (price <= 0) {
      return jsonError('Bu sovg‘a uchun sotish narxi kiritilmagan', 400);
    }

    const currentBalance = toNumber(dbUser.balance, 0);
    const nextBalance = currentBalance + price;

    const { data: updatedUser, error: userError } = await supabase
      .from('users')
      .update({ balance: nextBalance })
      .eq('id', Number(auth.telegramUser.id))
      .select('*')
      .single();

    if (userError) throw new Error(userError.message);

    const soldAt = new Date().toISOString();
    const { data: updatedHistory, error: sellError } = await supabase
      .from('open_history')
      .update({
        sold_at: soldAt,
        sale_price: price,
      })
      .eq('id', history.id)
      .eq('user_id', Number(auth.telegramUser.id))
      .is('sold_at', null)
      .select('*')
      .single();

    if (sellError) {
      throw new Error(`${sellError.message}. Supabase SQL ichida supabase/sell-gift.sql ni run qiling.`);
    }

    return Response.json({
      ok: true,
      user: updatedUser,
      balance: toNumber(updatedUser.balance, nextBalance),
      salePrice: price,
      history: updatedHistory,
    });
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
