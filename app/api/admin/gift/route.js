import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRewardType(value) {
  const type = cleanText(value).toLowerCase();
  return type === 'balance' ? 'balance' : 'gift';
}

function visibleChance(value) {
  return Math.max(0, toNumber(value, 0));
}

function realChanceValue(realChance, visible) {
  return Math.max(0, toNumber(realChance ?? visible, visibleChance(visible)));
}

function normalizeRarity(value, chance) {
  const rarity = cleanText(value).toLowerCase();
  if (['common', 'rare', 'epic', 'legendary', 'mythic'].includes(rarity)) return rarity;

  const numericChance = visibleChance(chance);
  if (numericChance <= 3) return 'mythic';
  if (numericChance <= 8) return 'legendary';
  if (numericChance <= 18) return 'epic';
  if (numericChance <= 40) return 'rare';

  return 'common';
}

function defaultBackground(rarity, rewardType = 'gift') {
  if (rewardType === 'balance') return '#facc15';
  if (rarity === 'mythic') return '#e11d48';
  if (rarity === 'legendary') return '#f59e0b';
  if (rarity === 'epic') return '#8b5cf6';
  if (rarity === 'rare') return '#2563eb';
  return '#2d3340';
}

async function caseExists(supabase, caseId) {
  const { data, error } = await supabase
    .from('cases')
    .select('id,title')
    .eq('id', caseId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return Boolean(data);
}

function publicGift(gift) {
  return {
    ...gift,
    type: normalizeRewardType(gift.type),
    chance: visibleChance(gift.chance),
    real_chance: realChanceValue(gift.real_chance, gift.chance),
    stock: toNumber(gift.stock),
    image_url: gift.image_url || null,
    animation_url: gift.animation_url || null,
    background_value: gift.background_value || null,
    rarity: gift.rarity || 'common',
  };
}

function validateRewardInput({ rewardType, title, value, imageUrl }) {
  if (title.length < 2) return 'Sovg‘a nomini yozing';

  if (rewardType === 'balance') {
    const amount = toNumber(value);

    if (amount <= 0) return 'Balans reward uchun summa 0 dan katta bo‘lishi kerak';

    return null;
  }

  if (!imageUrl) return 'Gift reward uchun sovg‘a rasmi majburiy. PNG yoki SVG yuklang.';

  return null;
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!auth.isAdmin) return jsonError('Admin ruxsati yo‘q', 403);

    const supabase = getSupabaseAdmin();
    const {
      action,
      giftId,
      case_id,
      title,
      type,
      value,
      chance,
      real_chance,
      stock,
      is_active,
      image_url,
      animation_url,
      background_value,
      rarity,
      floor_price,
      sell_price,
      buy_price,
    } = auth.body || {};

    if (action === 'list') {
      const { data, error } = await supabase
        .from('gifts')
        .select('*, cases(title)')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return Response.json({ ok: true, gifts: (data || []).map(publicGift) });
    }

    if (action === 'create') {
      const cleanCaseId = cleanText(case_id);
      const cleanTitle = cleanText(title);
      const rewardType = normalizeRewardType(type);
      const cleanValue = cleanText(value);
      const numericChance = visibleChance(chance);
      const numericRealChance = realChanceValue(real_chance, numericChance);
      const numericStock = Math.floor(toNumber(stock));
      const cleanImage = cleanText(image_url);
      const cleanAnimation = cleanText(animation_url);
      const finalRarity = normalizeRarity(rarity, numericChance);
      const finalBackground = cleanText(background_value) || defaultBackground(finalRarity, rewardType);
      const salePrice = Math.max(0, toNumber(sell_price ?? buy_price ?? floor_price ?? cleanValue, 0));

      if (!cleanCaseId) return jsonError('Qaysi casega qo‘shishni tanlang');
      if (!(await caseExists(supabase, cleanCaseId))) return jsonError('Tanlangan case topilmadi', 404);
      if (numericChance < 0 || numericChance > 100) return jsonError('Ko‘rinadigan chance 0 va 100 orasida bo‘lishi kerak');
      if (numericRealChance < 0 || numericRealChance > 100) return jsonError('Haqiqiy chance 0 va 100 orasida bo‘lishi kerak');
      if (numericStock <= 0) return jsonError('Stock kamida 1 bo‘lishi kerak');
      const validationError = validateRewardInput({ rewardType, title: cleanTitle, value: cleanValue, imageUrl: cleanImage });

      if (validationError) return jsonError(validationError);

      const { data, error } = await supabase
        .from('gifts')
        .insert({
          case_id: cleanCaseId,
          title: cleanTitle,
          type: rewardType,
          value: rewardType === 'balance' ? String(toNumber(cleanValue)) : cleanValue || String(salePrice || ''),
          chance: numericChance,
          real_chance: numericRealChance,
          stock: numericStock,
          image_url: rewardType === 'gift' ? cleanImage : cleanImage || null,
          animation_url: null,
          background_value: finalBackground,
          rarity: finalRarity,
          floor_price: salePrice,
          sell_price: salePrice,
          buy_price: salePrice,
          is_active: true,
        })
        .select('*')
        .single();

      if (error) throw new Error(`${error.message}. Supabase SQL ichida real-chance-sell.sql ni run qiling.`);

      return Response.json({ ok: true, gift: publicGift(data) });
    }

    if (action === 'update') {
      if (!giftId) return jsonError('giftId kerak');

      const { data: currentGift, error: currentError } = await supabase
        .from('gifts')
        .select('*')
        .eq('id', giftId)
        .single();

      if (currentError || !currentGift) return jsonError('Sovg‘a topilmadi', 404);

      const updates = {};

      if (case_id !== undefined) {
        const nextCaseId = cleanText(case_id);
        if (!nextCaseId) return jsonError('Qaysi casega qo‘shishni tanlang');
        if (!(await caseExists(supabase, nextCaseId))) return jsonError('Tanlangan case topilmadi', 404);
        updates.case_id = nextCaseId;
      }

      if (title !== undefined) updates.title = cleanText(title);
      if (type !== undefined) updates.type = normalizeRewardType(type);
      if (value !== undefined) updates.value = cleanText(value);
      if (chance !== undefined) updates.chance = visibleChance(chance);
      if (real_chance !== undefined) updates.real_chance = realChanceValue(real_chance, updates.chance ?? currentGift.chance);
      if (stock !== undefined) updates.stock = Math.max(0, Math.floor(toNumber(stock)));
      if (image_url !== undefined) updates.image_url = cleanText(image_url) || null;
      if (animation_url !== undefined) updates.animation_url = null;
      if (background_value !== undefined) updates.background_value = cleanText(background_value) || currentGift.background_value;
      if (rarity !== undefined) updates.rarity = normalizeRarity(rarity, updates.chance ?? currentGift.chance);
      if (is_active !== undefined) updates.is_active = Boolean(is_active);

      const nextSellPrice = sell_price ?? buy_price ?? floor_price;

      if (nextSellPrice !== undefined) {
        const salePrice = Math.max(0, toNumber(nextSellPrice, 0));
        updates.floor_price = salePrice;
        updates.sell_price = salePrice;
        updates.buy_price = salePrice;
      }

      const { data, error } = await supabase
        .from('gifts')
        .update(updates)
        .eq('id', giftId)
        .select('*')
        .single();

      if (error) throw new Error(`${error.message}. Supabase SQL ichida real-chance-sell.sql ni run qiling.`);

      return Response.json({ ok: true, gift: publicGift(data) });
    }

    if (action === 'delete') {
      if (!giftId) return jsonError('giftId kerak');

      const { error } = await supabase.from('gifts').delete().eq('id', giftId);

      if (error) throw new Error(error.message);

      return Response.json({ ok: true });
    }

    return jsonError('Noma’lum action');
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
