import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!auth.isAdmin) return jsonError('Admin ruxsati yo‘q', 403);

    const supabase = getSupabaseAdmin();
    const { action, userId, amount, is_banned } = auth.body || {};

    if (action === 'list') {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw new Error(error.message);
      return Response.json({ ok: true, users: data || [] });
    }

    if (action === 'add_balance') {
      if (!userId) return jsonError('userId kerak');

      const addAmount = Number(amount || 0);
      if (!Number.isFinite(addAmount) || addAmount === 0) return jsonError('amount noto‘g‘ri');

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !user) return jsonError('User topilmadi', 404);

      const newBalance = Number(user.balance || 0) + addAmount;

      const { data, error } = await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', userId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return Response.json({ ok: true, user: data });
    }

    if (action === 'ban') {
      if (!userId) return jsonError('userId kerak');

      const { data, error } = await supabase
        .from('users')
        .update({ is_banned: Boolean(is_banned) })
        .eq('id', userId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return Response.json({ ok: true, user: data });
    }

    return jsonError('Noma’lum action');
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
