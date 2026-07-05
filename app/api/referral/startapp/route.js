import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseReferralStartParam(value = '') {
  const clean = String(value || '').trim();
  const match = clean.match(/^ref[_-]?(\d+)$/i) || clean.match(/^r[_-]?(\d+)$/i);

  if (!match) return null;

  return {
    inviterId: Number(match[1]),
    payload: clean,
  };
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) {
      return jsonError(auth.error, auth.status);
    }

    const referral = parseReferralStartParam(auth.body?.startParam || auth.body?.start_param);

    if (!referral?.inviterId) {
      return Response.json({
        ok: true,
        tracked: false,
        reason: 'startapp payload referal emas',
      });
    }

    const invitedId = Number(auth.telegramUser.id);

    await ensureUser(auth.telegramUser);

    if (referral.inviterId === invitedId) {
      return Response.json({
        ok: true,
        tracked: false,
        reason: 'self referral ignored',
      });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('referrals')
      .upsert(
        {
          inviter_id: referral.inviterId,
          invited_id: invitedId,
          start_payload: referral.payload,
          status: 'joined',
        },
        { onConflict: 'inviter_id,invited_id' }
      )
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[referral:startapp]', error.message);

      return Response.json({
        ok: true,
        tracked: false,
        reason: 'referrals table unavailable',
      });
    }

    return Response.json({
      ok: true,
      tracked: true,
      referral: data,
    });
  } catch (error) {
    console.error('[referral:startapp]', error);

    return jsonError(error.message || 'Referal startapp xatosi', 500);
  }
}
