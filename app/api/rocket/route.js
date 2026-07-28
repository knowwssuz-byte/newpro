import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROCKET_CONFIG = Object.freeze({
  minBet: 1,
  maxBet: 10000,
  minAutoCashout: 1.1,
  maxAutoCashout: 100,
  growthRate: 0.1,
  pollIntervalMs: 350,
  houseEdgePercent: 4,
});

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );
}

function normalizeRound(value) {
  if (!value?.id) return null;

  const status = String(value.status || '');
  const isRunning = status === 'running';

  return {
    id: String(value.id),
    status,
    bet: Math.max(0, Math.floor(toNumber(value.bet))),
    payout: Math.max(0, Math.floor(toNumber(value.payout))),
    autoCashout:
      value.autoCashout == null && value.auto_cashout == null
        ? null
        : toNumber(value.autoCashout ?? value.auto_cashout),
    currentMultiplier: Math.max(
      1,
      toNumber(value.currentMultiplier ?? value.current_multiplier, 1)
    ),
    cashoutMultiplier:
      value.cashoutMultiplier == null && value.cashout_multiplier == null
        ? null
        : toNumber(value.cashoutMultiplier ?? value.cashout_multiplier),
    crashMultiplier:
      isRunning ||
      (value.crashMultiplier == null && value.crash_multiplier == null)
        ? null
        : toNumber(value.crashMultiplier ?? value.crash_multiplier),
    serverSeedHash:
      String(value.serverSeedHash || value.server_seed_hash || ''),
    serverSeed: isRunning
      ? ''
      : String(value.serverSeed || value.server_seed || ''),
    startedAt: value.startedAt || value.started_at || null,
    settledAt: value.settledAt || value.settled_at || null,
  };
}

function rpcMissing(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return (
    error?.code === 'PGRST202' ||
    text.includes('could not find the function') ||
    text.includes('does not exist in the schema cache') ||
    text.includes('relation "public.rocket_rounds" does not exist')
  );
}

function mapRocketError(error) {
  if (rpcMissing(error)) {
    return {
      status: 503,
      message:
        'Rocket SQL o‘rnatilmagan. Supabase SQL Editor’da sql/rocket-game.sql faylini ishga tushiring.',
      reason: 'ROCKET_SQL_MISSING',
    };
  }

  const message = String(error?.message || 'Rocket server xatosi');

  if (message.includes('INVALID_BET')) {
    return {
      status: 400,
      message: `Stavka ${ROCKET_CONFIG.minBet}–${ROCKET_CONFIG.maxBet} oralig‘ida bo‘lishi kerak.`,
    };
  }

  if (message.includes('INVALID_AUTO_CASHOUT')) {
    return {
      status: 400,
      message: `Auto cashout ${ROCKET_CONFIG.minAutoCashout.toFixed(2)}×–${ROCKET_CONFIG.maxAutoCashout.toFixed(2)}× oralig‘ida bo‘lishi kerak.`,
    };
  }

  if (message.includes('INSUFFICIENT_BALANCE')) {
    return { status: 400, message: 'Balans yetarli emas.' };
  }

  if (message.includes('ROUND_ALREADY_RUNNING')) {
    return {
      status: 409,
      message: 'Avvalgi Rocket raundi hali tugamagan.',
    };
  }

  if (message.includes('ROUND_NOT_FOUND')) {
    return { status: 404, message: 'Rocket raundi topilmadi.' };
  }

  if (message.includes('ROUND_ALREADY_SETTLED')) {
    return {
      status: 409,
      message: 'Bu raund allaqachon yakunlangan.',
    };
  }

  if (message.includes('USER_BANNED')) {
    return { status: 403, message: 'Siz bloklangansiz.' };
  }

  if (message.includes('USER_NOT_FOUND')) {
    return { status: 404, message: 'Foydalanuvchi topilmadi.' };
  }

  return { status: 500, message };
}

async function fetchHistory(supabase, userId) {
  const { data, error } = await supabase
    .from('rocket_rounds')
    .select(
      'id,status,bet,payout,auto_cashout,cashout_multiplier,crash_multiplier,server_seed_hash,server_seed,started_at,settled_at'
    )
    .eq('user_id', userId)
    .neq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    if (error.code === '42P01' || String(error.message || '').includes('rocket_rounds')) {
      const missing = new Error('Rocket SQL o‘rnatilmagan');
      missing.code = 'PGRST202';
      throw missing;
    }

    throw error;
  }

  return (data || []).map(normalizeRound).filter(Boolean);
}

async function callRocketRpc(supabase, name, params) {
  const { data, error } = await supabase.rpc(name, params);

  if (error) throw error;
  return data;
}

function responsePayload({ round, history, balance }) {
  return {
    ok: true,
    round: normalizeRound(round),
    ...(Array.isArray(history) ? { history } : {}),
    balance:
      balance == null
        ? round?.balance == null
          ? null
          : toNumber(round.balance)
        : toNumber(balance),
    config: ROCKET_CONFIG,
    serverTime: new Date().toISOString(),
  };
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
      return jsonError('Siz bloklangansiz.', 403);
    }

    const body = auth.body || {};
    const action = String(body.action || 'state').trim().toLowerCase();
    const userId = Number(auth.telegramUser.id);

    if (action === 'state') {
      const roundId = body.roundId ? String(body.roundId) : null;

      if (roundId && !isUuid(roundId)) {
        return jsonError('roundId noto‘g‘ri.', 400);
      }

      const round = await callRocketRpc(supabase, 'rocket_get_state', {
        p_user_id: userId,
        p_round_id: roundId,
      });
      const history =
        !roundId || round?.status !== 'running'
          ? await fetchHistory(supabase, userId)
          : undefined;

      return Response.json(
        responsePayload({
          round,
          history,
          balance: round?.balance ?? dbUser.balance,
        })
      );
    }

    if (action === 'start') {
      const bet = Number(body.bet);
      const autoCashout =
        body.autoCashout == null || body.autoCashout === ''
          ? null
          : Number(body.autoCashout);

      if (
        !Number.isSafeInteger(bet) ||
        bet < ROCKET_CONFIG.minBet ||
        bet > ROCKET_CONFIG.maxBet
      ) {
        return jsonError(
          `Stavka ${ROCKET_CONFIG.minBet}–${ROCKET_CONFIG.maxBet} oralig‘ida bo‘lishi kerak.`,
          400
        );
      }

      if (
        autoCashout != null &&
        (!Number.isFinite(autoCashout) ||
          autoCashout < ROCKET_CONFIG.minAutoCashout ||
          autoCashout > ROCKET_CONFIG.maxAutoCashout)
      ) {
        return jsonError(
          `Auto cashout ${ROCKET_CONFIG.minAutoCashout.toFixed(2)}×–${ROCKET_CONFIG.maxAutoCashout.toFixed(2)}× oralig‘ida bo‘lishi kerak.`,
          400
        );
      }

      const round = await callRocketRpc(supabase, 'rocket_start_round', {
        p_user_id: userId,
        p_bet: bet,
        p_auto_cashout:
          autoCashout == null ? null : Number(autoCashout.toFixed(2)),
      });

      return Response.json(responsePayload({ round }));
    }

    if (action === 'cashout') {
      const roundId = String(body.roundId || '');

      if (!isUuid(roundId)) {
        return jsonError('roundId noto‘g‘ri.', 400);
      }

      const round = await callRocketRpc(supabase, 'rocket_cash_out', {
        p_user_id: userId,
        p_round_id: roundId,
      });
      const history = await fetchHistory(supabase, userId);

      return Response.json(responsePayload({ round, history }));
    }

    return jsonError('Rocket action noto‘g‘ri.', 400);
  } catch (error) {
    const mapped = mapRocketError(error);
    return jsonError(mapped.message, mapped.status, {
      reason: mapped.reason,
    });
  }
}
