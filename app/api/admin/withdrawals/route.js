import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!auth.isAdmin) return jsonError('Admin ruxsati yo‘q', 403);

    const supabase = getSupabaseAdmin();
    const { action, requestId, status, admin_note } = auth.body || {};

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
      if (!['pending', 'approved', 'rejected'].includes(status)) return jsonError('status noto‘g‘ri');

      const { data, error } = await supabase
        .from('withdraw_requests')
        .update({ status, admin_note: admin_note || null })
        .eq('id', requestId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return Response.json({ ok: true, request: data });
    }

    return jsonError('Noma’lum action');
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
