import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);

    const supabase = getSupabaseAdmin();
    const dbUser = await ensureUser(auth.telegramUser);
    const { giftId } = auth.body || {};

    if (!giftId) return jsonError('giftId kerak');
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz', 403);

    const { data: gift, error: giftError } = await supabase
      .from('gifts')
      .select('*')
      .eq('id', giftId)
      .single();

    if (giftError || !gift) return jsonError('Sovg‘a topilmadi', 404);
    if (String(gift.type || '').toLowerCase() === 'balance') {
      return jsonError('Balans reward avtomatik balansga qo‘shiladi. Uni yechishga yuborish shart emas.', 400);
    }

    const { data, error } = await supabase
      .from('withdraw_requests')
      .insert({
        user_id: auth.telegramUser.id,
        gift_id: giftId,
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
