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

    const { data, error } = await supabase.rpc('referral_claim', {
      p_inviter_id: referral.inviterId,
      p_invited_id: invitedId,
      p_start_payload: referral.payload,
    });

    if (error) {
      console.error('[referral:startapp]', error.message);

      const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

      if (
        error.code === 'PGRST202' ||
        error.code === '42P01' ||
        text.includes('referral_claim') ||
        text.includes('referral_settings')
      ) {
        return jsonError(
          'Referal tizimi SQL o‘rnatilmagan. Supabase’da sql/referral-system.sql faylini to‘liq Run qiling.',
          503,
          { reason: 'REFERRAL_SQL_MISSING' }
        );
      }

      throw error;
    }

    return Response.json({
      ok: true,
      tracked: Boolean(data?.claimed),
      referral: data || null,
    });
  } catch (error) {
    console.error('[referral:startapp]', error);

    return jsonError(error.message || 'Referal startapp xatosi', 500);
  }
}
