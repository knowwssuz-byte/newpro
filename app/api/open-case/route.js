import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function visibleChance(gift) {
  return Math.max(0, toNumber(gift?.chance, 0));
}

function realChance(gift) {
  return Math.max(
    0,
    toNumber(
      gift?.real_chance ?? gift?.drop_chance ?? gift?.true_chance ?? gift?.chance,
      visibleChance(gift)
    )
  );
}

function normalizeGift(gift) {
  return {
    ...gift,
    chance: visibleChance(gift),
    real_chance: realChance(gift),
    stock: toNumber(gift.stock),
  };
}

function rewardType(gift) {
  return String(gift?.type || '').toLowerCase() === 'balance' ? 'balance' : 'gift';
}

function publicGift(gift) {
  if (!gift) return null;

  return {
    id: gift.id,
    case_id: gift.case_id,
    title: gift.title,
    type: rewardType(gift),
    value: gift.value,
    chance: visibleChance(gift),
    real_chance: realChance(gift),
    stock: toNumber(gift.stock),
    floor_price: toNumber(gift.floor_price ?? gift.sell_price ?? gift.buy_price ?? gift.value, 0),
    sell_price: toNumber(gift.sell_price ?? gift.buy_price ?? gift.floor_price ?? gift.value, 0),
    is_active: gift.is_active,
    image_url: gift.image_url || null,
    animation_url: gift.animation_url || null,
    background_value: gift.background_value || null,
    rarity: gift.rarity || null,
    created_at: gift.created_at,
  };
}

function pickWeightedGift(gifts) {
  const pool = gifts
    .map(normalizeGift)
    .filter((gift) => gift.is_active !== false && gift.stock > 0 && realChance(gift) > 0);

  const totalChance = pool.reduce((sum, gift) => sum + realChance(gift), 0);

  if (pool.length === 0 || totalChance <= 0) return null;

  let random = Math.random() * totalChance;

  for (const gift of pool) {
    random -= realChance(gift);

    if (random <= 0) return gift;
  }

  return pool[pool.length - 1] || null;
}

function shouldFallbackRpc(error) {
  if (!error) return false;

  const message = String(error.message || '').toLowerCase();

  return (
    error.code === 'PGRST202' ||
    message.includes('could not find the function') ||
    message.includes('function public.open_case_atomic')
  );
}

function mapRpcError(error) {
  const message = String(error?.message || 'Server xatosi');

  if (message.includes('USER_BANNED')) {
    return { message: 'Siz bloklangansiz', status: 403 };
  }

  if (message.includes('CASE_NOT_FOUND')) {
    return { message: 'Case topilmadi yoki aktiv emas', status: 404 };
  }

  if (message.includes('INSUFFICIENT_BALANCE')) {
    return { message: 'Balans yetarli emas', status: 400 };
  }

  if (message.includes('NO_READY_GIFTS')) {
    return {
      message: 'Bu case ichida ochiladigan sovg‘a yo‘q. Admin panelda active=true, real_chance > 0 va stock > 0 ekanini tekshiring.',
      status: 400,
    };
  }

  return { message, status: 500 };
}

function formatRpcResponse(payload) {
  const data = payload || {};
  const gift = data.gift || null;
  const history = data.history || null;
  const balanceBefore = toNumber(data.balanceBefore ?? data.balance_before);
  const balanceAfter = toNumber(data.balanceAfter ?? data.balance_after);
  const rewardAmount = toNumber(data.rewardAmount ?? data.reward_amount);
  const totalChance = toNumber(data.totalChance ?? data.total_chance);
  const poolSize = toNumber(data.poolSize ?? data.pool_size);

  return {
    ok: true,
    case: data.case || null,
    gift: publicGift(gift),
    balance: balanceAfter,
    balanceBefore,
    balanceAfter,
    price: toNumber(data.price),
    rewardAmount,
    history,
    reelPool: Array.isArray(data.reelPool || data.reel_pool)
      ? (data.reelPool || data.reel_pool).map(publicGift)
      : [],
    opening: {
      totalChance,
      poolSize,
      openedAt: history?.created_at || data.openedAt || data.opened_at || new Date().toISOString(),
      rewardType: rewardType(gift),
      rewardAmount,
    },
  };
}

async function openCaseWithRpc(supabase, userId, caseId) {
  const { data, error } = await supabase.rpc('open_case_atomic', {
    p_user_id: userId,
    p_case_id: caseId,
  });

  if (error) throw error;

  return formatRpcResponse(data);
}

async function decrementGiftStock(supabase, gift) {
  const currentStock = toNumber(gift.stock);
  const nextStock = currentStock - 1;

  if (currentStock <= 0) {
    return { ok: false, reason: 'STOCK_EMPTY' };
  }

  const { data, error } = await supabase
    .from('gifts')
    .update({ stock: nextStock })
    .eq('id', gift.id)
    .eq('stock', currentStock)
    .gt('stock', 0)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reason: 'STOCK_CHANGED' };

  return { ok: true, gift: data };
}

async function openCaseFallback(supabase, auth, dbUser, caseId) {
  const { data: caseItem, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .eq('is_active', true)
    .single();

  if (caseError || !caseItem) {
    return jsonError('Case topilmadi yoki aktiv emas', 404);
  }

  const userBalance = toNumber(dbUser.balance);
  const casePrice = Math.max(toNumber(caseItem.price), 0);

  if (userBalance < casePrice) {
    return jsonError('Balans yetarli emas', 400, {
      balance: userBalance,
      price: casePrice,
    });
  }

  const { data: giftRows, error: giftsError } = await supabase
    .from('gifts')
    .select('*')
    .eq('case_id', caseId)
    .eq('is_active', true)
    .gt('stock', 0);

  if (giftsError) throw new Error(giftsError.message);

  const gifts = (giftRows || []).map(normalizeGift);

  if (gifts.length === 0) {
    return jsonError(
      'Bu case ichida ochiladigan sovg‘a yo‘q. Admin panelda sovg‘a active=true, real_chance > 0 va stock > 0 ekanini tekshiring.',
      400,
      { reason: 'NO_READY_GIFTS' }
    );
  }

  const totalChance = gifts.reduce((sum, gift) => sum + realChance(gift), 0);

  if (totalChance <= 0) {
    return jsonError('Bu case uchun haqiqiy chance sozlanmagan');
  }

  let selectedGift = null;
  let updatedGift = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    selectedGift = pickWeightedGift(gifts);

    if (!selectedGift) break;

    const stockResult = await decrementGiftStock(supabase, selectedGift);

    if (stockResult.ok) {
      updatedGift = stockResult.gift;
      break;
    }
  }

  if (!updatedGift) {
    return jsonError(
      'Sovg‘a stocki boshqa ochishda tugab qoldi. Stockni ko‘paytiring yoki qayta urinib ko‘ring.',
      409,
      { reason: 'STOCK_CHANGED' }
    );
  }

  const rewardAmount = rewardType(updatedGift) === 'balance' ? Math.max(0, toNumber(updatedGift.value)) : 0;
  const newBalance = userBalance - casePrice + rewardAmount;

  const { data: updatedUser, error: balanceError } = await supabase
    .from('users')
    .update({ balance: newBalance })
    .eq('id', auth.telegramUser.id)
    .select('*')
    .single();

  if (balanceError) throw new Error(balanceError.message);

  const { data: history, error: historyError } = await supabase
    .from('open_history')
    .insert({
      user_id: auth.telegramUser.id,
      case_id: caseId,
      gift_id: updatedGift.id,
    })
    .select('id, created_at, user_id, case_id, gift_id')
    .single();

  if (historyError) throw new Error(historyError.message);

  return Response.json({
    ok: true,
    case: caseItem,
    gift: publicGift(updatedGift),
    balance: toNumber(updatedUser.balance),
    balanceBefore: userBalance,
    balanceAfter: toNumber(updatedUser.balance),
    price: casePrice,
    rewardAmount,
    history,
    reelPool: gifts.map(publicGift),
    opening: {
      totalChance,
      poolSize: gifts.length,
      openedAt: history.created_at,
      rewardType: rewardType(updatedGift),
      rewardAmount,
    },
  });
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);

    const supabase = getSupabaseAdmin();
    const dbUser = await ensureUser(auth.telegramUser);
    const { caseId } = auth.body || {};

    if (!caseId) return jsonError('caseId kerak');
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz', 403);

    try {
      return Response.json(await openCaseWithRpc(supabase, Number(auth.telegramUser.id), caseId));
    } catch (rpcError) {
      if (shouldFallbackRpc(rpcError)) {
        return jsonError(
          'Xavfsiz case ochish funksiyasi o‘rnatilmagan. Supabase SQL ichida gift-system-fix.sql faylini ishga tushiring.',
          503,
          { reason: 'OPEN_CASE_RPC_MISSING' }
        );
      }

      const mapped = mapRpcError(rpcError);
      return jsonError(mapped.message, mapped.status);
    }
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
