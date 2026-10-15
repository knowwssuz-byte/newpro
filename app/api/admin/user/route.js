import crypto from 'crypto';
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
      const uid = Number(userId);
      const delta = Number(amount);
      if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000000)
        return jsonError('User ID yoki butun Stars miqdori noto‘g‘ri.', 400);
      const operationId = /^[0-9a-f-]{36}$/i.test(String(auth.body?.operationId || ''))
        ? String(auth.body.operationId) : crypto.randomUUID();
      const { data, error } = await supabase.rpc('admin_balance_adjust_atomic', {
        p_user_id: uid, p_delta: delta, p_operation_id: operationId,
        p_reason: 'telegram-admin',
      });
      if (error) throw error;
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
