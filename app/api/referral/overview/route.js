import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sqlNotInstalled(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return (
    error?.code === 'PGRST202' ||
    error?.code === '42P01' ||
    error?.code === '42703' ||
    text.includes('referral_overview_stats') ||
    text.includes('referral_settings') ||
    text.includes('referral_rewards') ||
    text.includes('referrals')
  );
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);

    const userId = Number(auth.telegramUser.id);
    const supabase = getSupabaseAdmin();
    const user = await ensureUser(auth.telegramUser);

    if (user.is_banned) return jsonError('Siz bloklangansiz', 403);

    const [settingsResult, referralsResult, statsResult, invitedByResult] = await Promise.all([
      supabase
        .from('referral_settings')
        .select('enabled,inviter_reward,invitee_reward,activation_mode')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('referrals')
        .select('id,invited_id,status,joined_at,activated_at,rewarded_at,inviter_reward_amount')
        .eq('inviter_id', userId)
        .order('joined_at', { ascending: false })
        .limit(50),
      supabase
        .rpc('referral_overview_stats', { p_user_id: userId }),
      supabase
        .from('referrals')
        .select('inviter_id,status,joined_at')
        .eq('invited_id', userId)
        .maybeSingle(),
    ]);

    const firstError = [
      settingsResult.error,
      referralsResult.error,
      statsResult.error,
      invitedByResult.error,
    ].find(Boolean);

    if (firstError) {
      if (sqlNotInstalled(firstError)) {
        return jsonError(
          'Referal tizimi SQL o‘rnatilmagan. Supabase’da sql/referral-system.sql faylini to‘liq Run qiling.',
          503,
          { reason: 'REFERRAL_SQL_MISSING' }
        );
      }

      throw firstError;
    }

    const referrals = referralsResult.data || [];
    const friendIds = [...new Set(referrals.map((item) => Number(item.invited_id)).filter(Boolean))];
    let friendUsers = [];

    if (friendIds.length) {
      const friendResult = await supabase
        .from('users')
        .select('id,first_name,username')
        .in('id', friendIds);

      if (friendResult.error) throw friendResult.error;
      friendUsers = friendResult.data || [];
    }

    const usersById = new Map(friendUsers.map((item) => [Number(item.id), item]));
    const statsRow = statsResult.data || {};
    const total = Math.max(0, number(statsRow.total));
    const active = Math.max(0, number(statsRow.active));
    const earned = Math.max(0, number(statsRow.earned));
    const settings = settingsResult.data || {};

    return Response.json(
      {
        ok: true,
        referral: {
          balance: Math.max(0, number(user.balance)),
          settings: {
            enabled: settings.enabled !== false,
            inviterReward: Math.max(0, number(settings.inviter_reward)),
            inviteeReward: Math.max(0, number(settings.invitee_reward)),
            activationMode: settings.activation_mode || 'first_paid_activity',
          },
          stats: {
            total,
            active,
            pending: Math.max(0, total - active),
            earned,
            conversionRate: Math.max(0, number(statsRow.conversionRate ?? statsRow.conversion_rate)),
          },
          invitedBy: invitedByResult.data
            ? {
                userId: Number(invitedByResult.data.inviter_id),
                status: invitedByResult.data.status,
                joinedAt: invitedByResult.data.joined_at,
              }
            : null,
          friends: referrals.map((item) => {
            const friend = usersById.get(Number(item.invited_id));

            return {
              id: item.id,
              userId: Number(item.invited_id),
              firstName: friend?.first_name || '',
              username: friend?.username || '',
              status: item.status || 'joined',
              joinedAt: item.joined_at,
              activatedAt: item.activated_at,
              rewardedAt: item.rewarded_at,
              rewardAmount: Math.max(0, number(item.inviter_reward_amount)),
            };
          }),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[referral:overview]', error);
    return jsonError(error?.message || 'Referal statistikasini yuklab bo‘lmadi', 500);
  }
}
