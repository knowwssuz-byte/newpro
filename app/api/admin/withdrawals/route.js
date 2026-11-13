import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonError, readTelegramRequest } from '@/lib/telegramAuth';
import { normalizeTelegramUsername } from '@/lib/withdrawRecipient.mjs';
import { notifyWithdrawalDecision } from '@/lib/withdrawNotice';

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!auth.isAdmin) return jsonError('Admin ruxsati yo‘q', 403);

    const supabase = getSupabaseAdmin();
    const { action, requestId, status, admin_note, deliveryConfirmed, recipientUsername, requestVersion } = auth.body || {};

    if (action === 'list') {
      const { data: requests, error } = await supabase
        .from('withdraw_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw new Error(error.message);

      const userIds = [...new Set((requests || []).map((item) => item.user_id).filter(Boolean))];
      const giftIds = [...new Set((requests || []).map((item) => item.gift_id).filter(Boolean))];

      const [usersResult, giftsResult] = await Promise.all([
        userIds.length
          ? supabase.from('users').select('id, first_name, username').in('id', userIds)
          : Promise.resolve({ data: [], error: null }),
        giftIds.length
          ? supabase.from('gifts').select('id, title, type, value').in('id', giftIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (usersResult.error) throw new Error(usersResult.error.message);
      if (giftsResult.error) throw new Error(giftsResult.error.message);

      const usersById = Object.fromEntries((usersResult.data || []).map((user) => [String(user.id), user]));
      const giftsById = Object.fromEntries((giftsResult.data || []).map((gift) => [String(gift.id), gift]));

      const withdrawals = (requests || []).map((item) => ({
        ...item,
        users: usersById[String(item.user_id)] || null,
        gifts: giftsById[String(item.gift_id)] || null,
      }));

      return Response.json({ ok: true, withdrawals });
    }

    if (action === 'update') {
      if (!requestId) return jsonError('requestId kerak');
      if (!['approved', 'rejected'].includes(status)) return jsonError('Status noto‘g‘ri');
      const note = String(admin_note || '').trim().slice(0, 500);
      if (note.length < 8) return jsonError('Yetkazish dalili yoki rad etish sababi kamida 8 belgi bo‘lsin');
      if (status === 'approved' && deliveryConfirmed !== true) return jsonError('Gift Telegramda yuborilganini tasdiqlang');
      const { data: pending, error: findError } = await supabase.from('withdraw_requests')
        .select('id,user_id,gift_id,history_id,status,recipient_username,request_version').eq('id', requestId).maybeSingle();
      if (findError) throw findError;
      const version = Number(requestVersion);
      if (!Number.isSafeInteger(version) || version < 1 || pending?.request_version !== version) {
        return jsonError('So‘rov yangilangan. Admin ro‘yxatini yangilab, qayta tekshiring.', 409);
      }
      if (!pending || pending.status !== 'pending') return jsonError('So‘rov ko‘rib chiqilgan yoki topilmadi', 409);
      if (status === 'approved' && pending.history_id) {
        const { data: history, error: historyError } = await supabase.from('open_history')
          .select('user_id,gift_id,sold_at,upgraded_at').eq('id', pending.history_id).maybeSingle();
        if (historyError) throw historyError;
        if (!history || String(history.user_id) !== String(pending.user_id) ||
          String(history.gift_id) !== String(pending.gift_id) || history.sold_at || history.upgraded_at) {
          return jsonError('Gift tarixi yoki egasi mos kelmadi', 409);
        }
      }
      const destination = normalizeTelegramUsername(pending.recipient_username || recipientUsername);
      if (status === 'approved' && !destination) return jsonError('Qabul qiluvchi @username belgilanmagan.', 400);
      const changes = {
        status, admin_note: note,
        ...(!pending.recipient_username && destination ? {
          recipient_mode: 'self', recipient_username: destination, recipient_source: 'admin_legacy',
        } : {}),
      };
      const { data, error } = await supabase
        .from('withdraw_requests')
        .update(changes)
        .eq('id', requestId)
        .eq('status', 'pending')
        .eq('request_version', version)
        .select('*')
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return jsonError('So‘rov allaqachon ko‘rib chiqilgan yoki topilmadi.', 409);
      await notifyWithdrawalDecision(data);
      return Response.json({ ok: true, request: data });
    }

    return jsonError('Noma’lum action');
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
