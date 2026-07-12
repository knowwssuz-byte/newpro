import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

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

    if (historyError || !history) return jsonError('Yutuq topilmadi', 404);
    if (history.sold_at) return jsonError('Sotilgan sovg‘ani yechib bo‘lmaydi', 400);

    const { data: gift, error: giftError } = await supabase
      .from('gifts')
      .select('*')
      .eq('id', history.gift_id)
      .single();

    if (giftError || !gift) return jsonError('Sovg‘a topilmadi', 404);
    if (String(gift.type || '').toLowerCase() === 'balance') {
      return jsonError('Balans reward avtomatik balansga qo‘shiladi. Uni yechishga yuborish shart emas.', 400);
    }

    const { data: existing, error: existingError } = await supabase
      .from('withdraw_requests')
      .select('id,status')
      .eq('user_id', Number(auth.telegramUser.id))
      .eq('history_id', history.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) return jsonError('Bu yutuq uchun so‘rov allaqachon yuborilgan', 409);

    const { data, error } = await supabase
      .from('withdraw_requests')
      .insert({
        user_id: auth.telegramUser.id,
        gift_id: gift.id,
        history_id: history.id,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return Response.json({ ok: true, request: data });
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
