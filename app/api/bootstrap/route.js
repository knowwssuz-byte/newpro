import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
// Keep authenticated database calls next to Supabase ap-northeast-1 (Tokyo).
export const preferredRegion = 'hnd1';
export const dynamic = 'force-dynamic';

async function fetchCases(supabase, { onlyActive = false } = {}) {
  let ordered = supabase
    .from('cases')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  ordered = ordered.is('archived_at', null);
  if (onlyActive) ordered = ordered.eq('is_active', true);

  const result = await ordered;

  if (!result.error) return result.data || [];

  const text = `${result.error?.message || ''} ${result.error?.details || ''} ${result.error?.hint || ''}`;

  if (text.includes('sort_order') || text.includes('is_pinned') || result.error?.code === '42703') {
    let fallback = supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false });

    fallback = fallback.is('archived_at',null);
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
    // First paint only needs the user, case catalog, gifts and game switches.
    // Long inventory/history/upgrade requests are fetched after Home is usable.
    const phase = auth.body?.phase === 'essential' ? 'essential'
      : auth.body?.phase === 'extras' ? 'extras' : 'full';
    const wantsEssential = phase !== 'extras';
    const wantsExtra = phase !== 'essential';

    let giftsQuery = supabase.from('gifts').select('*').order('created_at', { ascending: false });

    if (!auth.isAdmin) {
      giftsQuery = giftsQuery.eq('is_active', true);
    }

    const [dbUser, cases, giftsResult, historyResult, withdrawResult, featureResult, upgradeResult, libraryResult] = await Promise.all([
      ensureUser(auth.telegramUser),
      wantsEssential ? fetchCases(supabase, { onlyActive: !auth.isAdmin }) : Promise.resolve([]),
      wantsEssential ? giftsQuery :
        (auth.isAdmin
          ? supabase.from('gifts').select('id,source,library_gift_id,stock,is_active').eq('source','upgrade_catalog')
          : supabase.from('gifts').select('id,source,library_gift_id,stock,is_active').eq('source','upgrade_catalog').eq('is_active',true)),
      wantsExtra ? supabase
        .from('open_history')
        .select('*')
        .eq('user_id', auth.telegramUser.id)
        .order('created_at', { ascending: false })
        .limit(250) : Promise.resolve({ data: [], error: null }),
      wantsExtra ? supabase
        .from('withdraw_requests')
        .select('*')
        .eq('user_id', auth.telegramUser.id)
        .order('created_at', { ascending: false })
        .limit(250) : Promise.resolve({ data: [], error: null }),
      wantsEssential ? supabase.from('app_settings').select('key,value').in('key', ['feature_rocket', 'feature_pvp', 'feature_upgrade']) : Promise.resolve({ data: [], error: null }),
      wantsExtra ? supabase.from('upgrade_rounds').select('id,user_id,source_history_id,source_gift_id,target_gift_id,reward_history_id,source_price,target_price,chance,outcome,created_at').eq('user_id', auth.telegramUser.id).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
      wantsExtra ? supabase.from('gift_library').select('id,title,price,buy_price,image_url,png_url,webp_url,animation_url,is_active,background_value').eq('is_active',true).order('title') : Promise.resolve({ data: [], error: null }),
    ]);

    if (dbUser.is_banned) {
      return jsonError('Siz bloklangansiz', 403);
    }

    if (giftsResult.error) throw new Error(giftsResult.error.message);
    if (historyResult.error) throw new Error(historyResult.error.message);
    if (withdrawResult.error) throw new Error(withdrawResult.error.message);
    if (upgradeResult.error) throw new Error(upgradeResult.error.message);
    if (libraryResult.error) throw new Error(libraryResult.error.message);

    // A player's owned gift may have since been disabled in the public case
    // catalog. Resolve inventory media/prices separately from active gifts.
    // Only fetch gift IDs that this authenticated user actually won.
    const ownedGiftIds = [...new Set((historyResult.data || [])
      .map((item) => item.gift_id).filter(Boolean))];
    const inventoryResult = ownedGiftIds.length
      ? await supabase.from('gifts').select('*').in('id', ownedGiftIds)
      : { data: [], error: null };
    if (inventoryResult.error) throw new Error(inventoryResult.error.message);

    const stockByLibrary=new Map((giftsResult.data||[]).filter((g)=>g.source==='upgrade_catalog'&&g.library_gift_id).map((g)=>[g.library_gift_id,g]));
    const upgradeCatalog=(libraryResult.data||[]).map((lib)=>{
      const stockGift=stockByLibrary.get(lib.id);
      const price=Number(lib.buy_price||lib.price||0);
      return {...lib,id:stockGift?.id||lib.id,library_gift_id:lib.id,
        type:'gift',source:'upgrade_catalog',is_active:true,stock:Number(stockGift?.stock||0),
        price,buy_price:price,sell_price:price,floor_price:price,
        image_url:lib.image_url||lib.png_url||lib.webp_url||'',animation_url:lib.animation_url||''};
    }).filter((item)=>item.price>0);
    const featureSettings = featureResult.error
      ? {}
      : Object.fromEntries((featureResult.data || []).map((item) => [item.key, item.value || {}]));

    return Response.json({
      ok: true,
      phase,
      ...(wantsEssential ? {
        user: dbUser,
        telegramUser: auth.telegramUser,
        isAdmin: auth.isAdmin,
        cases,
        gifts: auth.isAdmin
          ? (giftsResult.data || []).filter((g)=>g.source!=='upgrade_catalog')
          : giftsWithActualOdds((giftsResult.data || []).filter((g)=>g.source!=='upgrade_catalog')),
        featureSettings,
      } : {}),
      ...(wantsExtra ? {
        history: historyResult.data || [],
        inventoryGifts: inventoryResult.data || [],
        withdrawals: withdrawResult.data || [],
        upgradeRounds: upgradeResult.data || [],
        upgradeCatalog,
      } : {}),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[bootstrap]',String(error?.code||'ERROR').slice(0,45));
    return jsonError('Ma’lumotlarni yuklab bo‘lmadi', 500);
  }
}
