import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DICE_CONFIG = Object.freeze({
  minBet: 1,
  maxBet: 10000,
  minTarget: 5,
  maxTarget: 95,
  houseEdgePercent: 3,
});

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicConfig() {
  return {
    minBet: DICE_CONFIG.minBet,
    maxBet: DICE_CONFIG.maxBet,
    minTarget: DICE_CONFIG.minTarget,
    maxTarget: DICE_CONFIG.maxTarget,
    houseEdgePercent: DICE_CONFIG.houseEdgePercent,
  };
}

function mapError(error) {
  const message = String(error?.message || 'Dice server xatosi');

  if (message.includes('INSUFFICIENT_BALANCE')) {
    return { status: 400, message: 'Balans yetarli emas.' };
  }

  if (message.includes('BALANCE_CONFLICT')) {
    return { status: 409, message: 'Balans yangilandi. Qayta urinib ko‘ring.' };
  }

  if (message.includes('USER_BANNED')) {
    return { status: 403, message: 'Siz bloklangansiz.' };
  }

  return { status: 500, message };
}

function makeOutcome({ mode, target, bet }) {
  const chancePercent = mode === 'higher' ? 100 - target : target;
  const multiplier = Math.floor(
    ((100 - DICE_CONFIG.houseEdgePercent) / chancePercent) * 100
  ) / 100;
  const roll = crypto.randomInt(0, 10000) / 100;
  const won = mode === 'higher' ? roll > target : roll < target;
  const payout = won ? Math.max(bet + 1, Math.floor(bet * multiplier)) : 0;

  return {
    id: crypto.randomUUID(),
    mode,
    target,
    roll,
    won,
    bet,
    payout,
    profit: payout - bet,
    multiplier,
    chancePercent,
    playedAt: new Date().toISOString(),
  };
}

async function settleBalance(supabase, userId, bet, payout) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: currentUser, error: readError } = await supabase
      .from('users')
      .select('id,balance,is_banned')
      .eq('id', userId)
      .single();

    if (readError) throw readError;
    if (currentUser?.is_banned) throw new Error('USER_BANNED');

    const currentBalance = Math.max(0, number(currentUser?.balance));
    if (currentBalance < bet) throw new Error('INSUFFICIENT_BALANCE');

    const nextBalance = currentBalance - bet + payout;
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ balance: nextBalance })
      .eq('id', userId)
      .eq('balance', currentBalance)
      .select('id,balance')
      .maybeSingle();

    if (updateError) throw updateError;
    if (updatedUser) return Math.max(0, number(updatedUser.balance, nextBalance));
  }

  throw new Error('BALANCE_CONFLICT');
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    const body = auth.body || {};
    const action = String(body.action || 'play').toLowerCase();
    const dbUser = await ensureUser(auth.telegramUser);

    if (action === 'state') {
      return Response.json({
        ok: true,
        balance: Math.max(0, number(dbUser.balance)),
        config: publicConfig(),
      });
    }

    if (action !== 'play') return jsonError('Noto‘g‘ri Dice amali.', 400);
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz.', 403);

    const mode = String(body.mode || '').toLowerCase();
    const target = integer(body.target, -1);
    const bet = integer(body.bet, -1);

    if (!['higher', 'lower'].includes(mode)) {
      return jsonError('Rejim Past yoki Baland bo‘lishi kerak.', 400);
    }

    if (target < DICE_CONFIG.minTarget || target > DICE_CONFIG.maxTarget) {
      return jsonError(
        `Tanlangan son ${DICE_CONFIG.minTarget}–${DICE_CONFIG.maxTarget} oralig‘ida bo‘lishi kerak.`,
        400
      );
    }

    if (bet < DICE_CONFIG.minBet || bet > DICE_CONFIG.maxBet) {
      return jsonError(
        `Stavka ${DICE_CONFIG.minBet}–${DICE_CONFIG.maxBet} Stars oralig‘ida bo‘lishi kerak.`,
        400
      );
    }

    const outcome = makeOutcome({ mode, target, bet });
    const supabase = getSupabaseAdmin();
    const balance = await settleBalance(
      supabase,
      Number(auth.telegramUser.id),
      outcome.bet,
      outcome.payout
    );

    return Response.json({
      ok: true,
      balance,
      result: outcome,
      config: publicConfig(),
    });
  } catch (error) {
    const mapped = mapError(error);
    return jsonError(mapped.message, mapped.status);
  }
}
