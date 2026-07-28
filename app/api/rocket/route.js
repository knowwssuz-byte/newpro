import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROCKET_CONFIG = Object.freeze({
  minBet: 1,
  maxBet: 10000,
  minAutoCashout: 1.1,
  maxAutoCashout: 100,
  bettingWindowMs: 7000,
  resultHoldMs: 1400,
  growthRate: 0.075,
  pollIntervalMs: 200,
  houseEdgePercent: 2,
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

function cleanName(value, fallback = 'Player') {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 40);

  return text || fallback;
}

function normalizeRound(value) {
  if (!value?.id) return null;

  const status = String(value.status || 'betting');
  const reveal = status === 'crashed';

  return {
    id: String(value.id),
    number: Math.max(0, Math.floor(toNumber(value.number ?? value.round_no))),
    status,
    currentMultiplier: Math.max(
      1,
      toNumber(value.currentMultiplier ?? value.current_multiplier, 1)
    ),
    crashMultiplier:
      reveal &&
      (value.crashMultiplier != null || value.crash_multiplier != null)
        ? toNumber(value.crashMultiplier ?? value.crash_multiplier)
        : null,
    serverSeedHash: String(
      value.serverSeedHash || value.server_seed_hash || ''
    ),
    serverSeed: reveal
      ? String(value.serverSeed || value.server_seed || '')
      : '',
    bettingOpensAt:
      value.bettingOpensAt || value.betting_opens_at || null,
    startsAt: value.startsAt || value.starts_at || null,
    settledAt: value.settledAt || value.settled_at || null,
    growthRate: Math.min(
      1,
      Math.max(
        0.01,
        toNumber(
          value.growthRate ?? value.growth_rate,
          ROCKET_CONFIG.growthRate
        )
      )
    ),
    houseEdgeBps: Math.min(
      2000,
      Math.max(
        0,
        Math.floor(
          toNumber(
            value.houseEdgeBps ?? value.house_edge_bps,
            ROCKET_CONFIG.houseEdgePercent * 100
          )
        )
      )
    ),
    algorithmVersion: Math.max(
      1,
      Math.floor(
        toNumber(value.algorithmVersion ?? value.algorithm_version, 1)
      )
    ),
  };
}

function normalizeBet(value) {
  if (!value?.id) return null;

  return {
    id: String(value.id),
    roundId: String(value.roundId || value.round_id || ''),
    status: String(value.status || 'placed'),
    bet: Math.max(0, Math.floor(toNumber(value.bet))),
    payout: Math.max(0, Math.floor(toNumber(value.payout))),
    autoCashout:
      value.autoCashout == null && value.auto_cashout == null
        ? null
        : toNumber(value.autoCashout ?? value.auto_cashout),
    cashoutMultiplier:
      value.cashoutMultiplier == null &&
      value.cashout_multiplier == null
        ? null
        : toNumber(
            value.cashoutMultiplier ?? value.cashout_multiplier
          ),
    createdAt: value.createdAt || value.created_at || null,
    settledAt: value.settledAt || value.settled_at || null,
  };
}

function rpcMissing(error) {
  const text =
    `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return (
    error?.code === 'PGRST202' ||
    error?.code === '42P01' ||
    text.includes('could not find the function') ||
    text.includes('does not exist in the schema cache') ||
    (text.includes('does not exist') &&
      (text.includes('rocket_game_rounds') ||
        text.includes('rocket_game_bets')))
  );
}

function mapRocketError(error) {
  if (rpcMissing(error)) {
    return {
      status: 503,
      message:
        'Rocket V5 SQL o‘rnatilmagan. Supabase SQL Editor’da sql/rocket-game.sql faylini ishga tushiring.',
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

  if (message.includes('BET_ALREADY_PLACED')) {
    return {
      status: 409,
      message: 'Bu raund uchun stavka allaqachon qo‘yilgan.',
    };
  }

  if (message.includes('ROUND_CLOSED')) {
    return {
      status: 409,
      message: 'Stavka vaqti tugadi. Keyingi raundni kuting.',
    };
  }

  if (message.includes('ROUND_NOT_FLYING')) {
    return {
      status: 409,
      message: 'Cash out faqat raketa uchayotgan paytda ishlaydi.',
    };
  }

  if (message.includes('ROUND_CRASHED')) {
    return {
      status: 409,
      message: 'Kech qoldingiz — raketa portladi.',
    };
  }

  if (message.includes('BET_NOT_FOUND')) {
    return { status: 404, message: 'Bu raunddagi stavka topilmadi.' };
  }

  if (message.includes('USER_BANNED')) {
    return { status: 403, message: 'Siz bloklangansiz.' };
  }

  if (message.includes('USER_NOT_FOUND')) {
    return { status: 404, message: 'Foydalanuvchi topilmadi.' };
  }

  return { status: 500, message };
}

async function callRocketRpc(supabase, name, params) {
  const { data, error } = await supabase.rpc(name, params);

  if (error) throw error;
  return data;
}

async function fetchRecentRounds(supabase) {
  const { data, error } = await supabase
    .from('rocket_game_rounds')
    .select('id,round_no,crash_multiplier,starts_at,settled_at')
    .eq('status', 'crashed')
    .order('round_no', { ascending: false })
    .limit(14);

  if (error) throw error;

  return (data || []).map((item) => ({
    id: String(item.id),
    number: Math.max(0, Math.floor(toNumber(item.round_no))),
    crashMultiplier: Math.max(1, toNumber(item.crash_multiplier, 1)),
    startsAt: item.starts_at || null,
    settledAt: item.settled_at || null,
  }));
}

async function fetchRoundPlayers(supabase, roundId, currentUserId) {
  if (!roundId) return [];

  const { data: bets, error: betsError } = await supabase
    .from('rocket_game_bets')
    .select(
      'id,user_id,bet,payout,status,auto_cashout,cashout_multiplier,created_at'
    )
    .eq('round_id', roundId)
    .order('bet', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(40);

  if (betsError) throw betsError;
  if (!bets?.length) return [];

  const userIds = [...new Set(bets.map((item) => item.user_id))];
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id,first_name,username')
    .in('id', userIds);

  if (usersError) throw usersError;

  const userMap = new Map(
    (users || []).map((item) => [String(item.id), item])
  );

  return bets.map((item) => {
    const user = userMap.get(String(item.user_id)) || {};
    const fallback = user.username
      ? `@${String(user.username).replace(/^@/, '')}`
      : 'Player';

    return {
      id: String(item.id),
      name: cleanName(user.first_name, fallback),
      username: user.username
        ? cleanName(`@${String(user.username).replace(/^@/, '')}`, '')
        : '',
      bet: Math.max(0, Math.floor(toNumber(item.bet))),
      payout: Math.max(0, Math.floor(toNumber(item.payout))),
      status: String(item.status || 'placed'),
      autoCashout:
        item.auto_cashout == null ? null : toNumber(item.auto_cashout),
      cashoutMultiplier:
        item.cashout_multiplier == null
          ? null
          : toNumber(item.cashout_multiplier),
      isYou: String(item.user_id) === String(currentUserId),
      createdAt: item.created_at || null,
    };
  });
}

async function buildResponse({
  supabase,
  state,
  userId,
  includeSocial = true,
}) {
  /*
   * Capture the state timestamp before optional social queries. Previously
   * players/history latency was included in serverTime even though the
   * multiplier had already been sampled, which made the client clock appear
   * ahead of the confirmed multiplier.
   */
  const serverTime = new Date().toISOString();
  const round = normalizeRound(state?.round);
  const payload = {
    ok: true,
    round,
    bet: normalizeBet(state?.bet),
    balance: Math.max(0, toNumber(state?.balance)),
    config: ROCKET_CONFIG,
  };

  if (includeSocial) {
    const [history, players] = await Promise.all([
      fetchRecentRounds(supabase),
      fetchRoundPlayers(supabase, round?.id, userId),
    ]);

    payload.history = history;
    payload.players = players;
  }

  payload.serverTime = serverTime;
  return payload;
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) {
      return jsonError(auth.error, auth.status);
    }

    const supabase = getSupabaseAdmin();
    const body = auth.body || {};
    const action = String(body.action || 'state').trim().toLowerCase();
    /*
     * Place/cashout responses stay on the shortest possible path. Social
     * lists are refreshed by the normal state poll and must never delay a
     * balance-changing action.
     */
    const includeSocial =
      body.includeSocial === true ||
      (action === 'state' && body.includeSocial !== false);
    const userId = Number(auth.telegramUser.id);
    const callForUser = async (name, params) => {
      try {
        return await callRocketRpc(supabase, name, params);
      } catch (error) {
        if (!String(error?.message || '').includes('USER_NOT_FOUND')) {
          throw error;
        }

        await ensureUser(auth.telegramUser);
        return callRocketRpc(supabase, name, params);
      }
    };
    let state;

    if (action === 'state') {
      state = await callForUser('rocket_get_game_state', {
        p_user_id: userId,
      });
    } else if (action === 'place' || action === 'start') {
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

      state = await callForUser('rocket_place_bet', {
        p_user_id: userId,
        p_bet: bet,
        p_auto_cashout:
          autoCashout == null ? null : Number(autoCashout.toFixed(2)),
      });
    } else if (action === 'cashout') {
      const roundId = String(body.roundId || '');

      if (!isUuid(roundId)) {
        return jsonError('roundId noto‘g‘ri.', 400);
      }

      state = await callForUser('rocket_cash_out_v2', {
        p_user_id: userId,
        p_round_id: roundId,
      });
    } else {
      return jsonError('Rocket action noto‘g‘ri.', 400);
    }

    const payload = await buildResponse({
      supabase,
      state,
      userId,
      includeSocial,
    });

    return Response.json(payload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    const mapped = mapRocketError(error);
    return jsonError(mapped.message, mapped.status, {
      reason: mapped.reason,
    });
  }
}
