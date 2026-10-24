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

// Weight-based draws are normalized to truthful percentages for player UI.
function giftsWithActualOdds(gifts) {
  const totals = new Map();
  for (const gift of gifts) {
    const weight = Math.max(0, Number(gift.real_chance ?? gift.chance) || 0);
    if (gift.is_active === false || Number(gift.stock) <= 0) continue;
    totals.set(gift.case_id, (totals.get(gift.case_id) || 0) + weight);
  }
  return gifts.map((gift) => {
    const total = totals.get(gift.case_id) || 0;
    const weight = gift.is_active === false || Number(gift.stock) <= 0
      ? 0 : Math.max(0, Number(gift.real_chance ?? gift.chance) || 0);
    const percent = total > 0 ? Math.round(weight / total * 10000) / 100 : 0;
    return { ...gift, chance: percent, real_chance: percent };
  });
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) {
      return jsonError(auth.error, auth.status);
    }

    const supabase = getSupabaseAdmin();

    let giftsQuery = supabase.from('gifts').select('*').order('created_at', { ascending: false });

    if (!auth.isAdmin) {
      giftsQuery = giftsQuery.eq('is_active', true);
    }

    const [dbUser, cases, giftsResult, historyResult, withdrawResult, featureResult, upgradeResult] = await Promise.all([
      ensureUser(auth.telegramUser),
      fetchCases(supabase, { onlyActive: !auth.isAdmin }),
      giftsQuery,
      supabase
        .from('open_history')
        .select('*')
        .eq('user_id', auth.telegramUser.id)
        .order('created_at', { ascending: false })
        .limit(250),
      supabase
        .from('withdraw_requests')
        .select('*')
        .eq('user_id', auth.telegramUser.id)
        .order('created_at', { ascending: false })
        .limit(250),
      supabase.from('app_settings').select('key,value').in('key', ['feature_rocket', 'feature_pvp', 'feature_upgrade']),
      supabase.from('upgrade_rounds').select('id,user_id,source_history_id,source_gift_id,target_gift_id,reward_history_id,source_price,target_price,chance,outcome,created_at').eq('user_id', auth.telegramUser.id).order('created_at', { ascending: false }).limit(50),
    ]);

    if (dbUser.is_banned) {
      return jsonError('Siz bloklangansiz', 403);
    }

    if (giftsResult.error) throw new Error(giftsResult.error.message);
    if (historyResult.error) throw new Error(historyResult.error.message);
    if (withdrawResult.error) throw new Error(withdrawResult.error.message);
    if (upgradeResult.error) throw new Error(upgradeResult.error.message);

    // A player's owned gift may have since been disabled in the public case
    // catalog. Resolve inventory media/prices separately from active gifts.
    // Only fetch gift IDs that this authenticated user actually won.
    const ownedGiftIds = [...new Set((historyResult.data || [])
      .map((item) => item.gift_id).filter(Boolean))];
    const inventoryResult = ownedGiftIds.length
      ? await supabase.from('gifts').select('*').in('id', ownedGiftIds)
      : { data: [], error: null };
    if (inventoryResult.error) throw new Error(inventoryResult.error.message);

    const featureSettings = featureResult.error
      ? {}
      : Object.fromEntries((featureResult.data || []).map((item) => [item.key, item.value || {}]));

    return Response.json({
      ok: true,
      user: dbUser,
      telegramUser: auth.telegramUser,
      isAdmin: auth.isAdmin,
      cases,
      gifts: auth.isAdmin ? (giftsResult.data || []) : giftsWithActualOdds(giftsResult.data || []),
      history: historyResult.data || [],
      inventoryGifts: inventoryResult.data || [],
      withdrawals: withdrawResult.data || [],
      upgradeRounds: upgradeResult.data || [],
      featureSettings,
    });
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
