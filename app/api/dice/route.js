import crypto from 'crypto';
import { diceSettingsForClient, getDiceSettings } from '@/lib/diceSettings';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicConfig(settings) {
  return diceSettingsForClient(settings);
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

function makeOutcome({ mode, target, bet, settings }) {
  const chancePercent = mode === 'higher' ? 100 - target : target;
  const multiplier = Math.floor(
    ((100 - settings.houseEdgePercent) / chancePercent) * 100
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
    const supabase = getSupabaseAdmin();
    const [dbUser, settings] = await Promise.all([
      ensureUser(auth.telegramUser),
      getDiceSettings(supabase),
    ]);

    if (action === 'state') {
      return Response.json({
        ok: true,
        balance: Math.max(0, number(dbUser.balance)),
        config: publicConfig(settings),
      });
    }

    if (action !== 'play') return jsonError('Noto‘g‘ri Dice amali.', 400);
    if (dbUser.is_banned) return jsonError('Siz bloklangansiz.', 403);
    if (!settings.enabled) return jsonError('Dice o‘yini vaqtincha o‘chirilgan.', 403);

    const mode = String(body.mode || '').toLowerCase();
    const target = integer(body.target, -1);
    const bet = integer(body.bet, -1);

    if (!['higher', 'lower'].includes(mode)) {
      return jsonError('Rejim Past yoki Baland bo‘lishi kerak.', 400);
    }

    const chancePercent = mode === 'higher' ? 100 - target : target;

    if (
      chancePercent < settings.minWinChance ||
      chancePercent > settings.maxWinChance
    ) {
      return jsonError(
        `Yutish ehtimoli ${settings.minWinChance}%–${settings.maxWinChance}% oralig‘ida bo‘lishi kerak.`,
        400
      );
    }

    if (bet < settings.minBet || bet > settings.maxBet) {
      return jsonError(
        `Stavka ${settings.minBet}–${settings.maxBet} Stars oralig‘ida bo‘lishi kerak.`,
        400
      );
    }

    const outcome = makeOutcome({ mode, target, bet, settings });
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
      config: publicConfig(settings),
    });
  } catch (error) {
    const mapped = mapError(error);
    return jsonError(mapped.message, mapped.status);
  }
}
