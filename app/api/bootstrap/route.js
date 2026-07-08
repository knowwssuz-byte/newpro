import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fetchCases(supabase, { onlyActive = false } = {}) {
  let ordered = supabase
    .from('cases')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (onlyActive) ordered = ordered.eq('is_active', true);

  const result = await ordered;

  if (!result.error) return result.data || [];

  const text = `${result.error?.message || ''} ${result.error?.details || ''} ${result.error?.hint || ''}`;

  if (text.includes('sort_order') || text.includes('is_pinned') || result.error?.code === '42703') {
    let fallback = supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false });

    if (onlyActive) fallback = fallback.eq('is_active', true);

    const fallbackResult = await fallback;

    if (fallbackResult.error) throw new Error(fallbackResult.error.message);

    return fallbackResult.data || [];
  }

  throw new Error(result.error.message);
}

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

    let giftsQuery = supabase.from('gifts').select('*').order('created_at', { ascending: false });

    if (!auth.isAdmin) {
      giftsQuery = giftsQuery.eq('is_active', true);
    }

    const [cases, giftsResult, historyResult, withdrawResult] = await Promise.all([
      fetchCases(supabase, { onlyActive: !auth.isAdmin }),
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

    if (giftsResult.error) throw new Error(giftsResult.error.message);
    if (historyResult.error) throw new Error(historyResult.error.message);
    if (withdrawResult.error) throw new Error(withdrawResult.error.message);

    return Response.json({
      ok: true,
      user: dbUser,
      telegramUser: auth.telegramUser,
      isAdmin: auth.isAdmin,
      cases,
      gifts: giftsResult.data || [],
      history: historyResult.data || [],
      withdrawals: withdrawResult.data || [],
    });
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
