import crypto from 'crypto';
import { getDiceMultiplier, getDicePayout } from '@/lib/diceMath.mjs';
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

  if (message.includes('INVALID_DICE_')) {
    return { status: 400, message: 'Dice ma’lumotlari noto‘g‘ri.' };
  }

  if (error?.code === 'PGRST202' || message.includes('dice_play_atomic')) {
    return { status: 503, message: 'Dice vaqtincha mavjud emas.' };
  }

  if (message.includes('USER_BANNED')) {
    return { status: 403, message: 'Siz bloklangansiz.' };
  }

  console.error('Dice settlement failed', { code: error?.code, message });
  return { status: 500, message: 'Dice server xatosi. Qayta urinib ko‘ring.' };
}

function makeOutcome({ mode, target, bet, settings }) {
  const chancePercent = mode === 'higher' ? 100 - target : target;
  const multiplier = getDiceMultiplier(chancePercent, settings.houseEdgePercent);
  const roll = crypto.randomInt(0, 10000) / 100;
  // Uniform 0.01-point outcomes: inclusive threshold matches the published odds.
  const won = mode === 'higher' ? roll >= target : roll < target;
  const payout = getDicePayout(bet, chancePercent, settings.houseEdgePercent, won);

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

// Settlement and the audit record must commit together; no partial balances.
async function settleBalance(supabase, userId, outcome) {
  const { data, error } = await supabase.rpc('dice_play_atomic', {
    p_id: outcome.id,
    p_user_id: userId,
    p_mode: outcome.mode,
    p_target: outcome.target,
    p_roll: outcome.roll,
    p_won: outcome.won,
    p_bet: outcome.bet,
    p_payout: outcome.payout,
    p_multiplier: outcome.multiplier,
    p_chance: outcome.chancePercent,
  });
  if (error) throw error;
  return number(data);
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
      const { data: rounds, error: roundsError } = await supabase
        .from('dice_rounds')
        .select('id,mode,target,roll,won,bet,payout,created_at')
        .eq('user_id', Number(auth.telegramUser.id))
        .order('created_at', { ascending: false })
        .limit(6);
      if (roundsError) throw roundsError;
      return Response.json({
        ok: true,
        balance: Math.max(0, number(dbUser.balance)),
        config: publicConfig(settings),
        recent: (rounds || []).map((round) => ({
          ...round,
          profit: number(round.payout) - number(round.bet),
          playedAt: round.created_at,
        })),
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

    if (getDicePayout(bet, chancePercent, settings.houseEdgePercent, true) <= bet) {
      return jsonError('Bu stavka va ehtimol bilan foydali yutuq yo‘q. Stavkani oshiring yoki ehtimolni pasaytiring.', 400);
    }

    const outcome = makeOutcome({ mode, target, bet, settings });
    const balance = await settleBalance(
      supabase,
      Number(auth.telegramUser.id),
      outcome
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
