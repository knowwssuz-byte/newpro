import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) {
      return jsonError(auth.error, auth.status);
    }

    const supabase = getSupabaseAdmin();
    const dbUser = await ensureUser(auth.telegramUser);

    if (dbUser.is_banned) {
      return jsonError('Siz bloklangansiz', 403);
    }

    let casesQuery = supabase.from('cases').select('*').order('created_at', { ascending: false });
    let giftsQuery = supabase.from('gifts').select('*').order('created_at', { ascending: false });

    if (!auth.isAdmin) {
      casesQuery = casesQuery.eq('is_active', true);
      giftsQuery = giftsQuery.eq('is_active', true);
    }

    const [casesResult, giftsResult, historyResult, withdrawResult] = await Promise.all([
      casesQuery,
      giftsQuery,
      supabase
        .from('open_history')
        .select('*')
        .eq('user_id', auth.telegramUser.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('withdraw_requests')
        .select('*')
        .eq('user_id', auth.telegramUser.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (casesResult.error) throw new Error(casesResult.error.message);
    if (giftsResult.error) throw new Error(giftsResult.error.message);
    if (historyResult.error) throw new Error(historyResult.error.message);
    if (withdrawResult.error) throw new Error(withdrawResult.error.message);

    return Response.json({
      ok: true,
      user: dbUser,
      telegramUser: auth.telegramUser,
      isAdmin: auth.isAdmin,
      cases: casesResult.data || [],
      gifts: giftsResult.data || [],
      history: historyResult.data || [],
      withdrawals: withdrawResult.data || [],
    });
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
