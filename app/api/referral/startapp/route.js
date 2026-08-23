import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  assessAndRegisterReferralDevice,
  saveReferralAudit,
} from '@/lib/referralFraud';
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

    const invitedId = Number(auth.telegramUser.id);
    const supabase = getSupabaseAdmin();
    const pendingKey = `referral_pending_${invitedId}`;
    const [user, pendingResult] = await Promise.all([
      ensureUser(auth.telegramUser),
      supabase.from('app_settings').select('value').eq('key', pendingKey).maybeSingle(),
    ]);

    if (pendingResult.error) throw pendingResult.error;
    if (user.is_banned) return jsonError('Siz bloklangansiz', 403);

    const signedReferral = parseReferralStartParam(auth.startParam);
    const pendingValue = pendingResult.data?.value || {};
    const pendingReferral = Number(pendingValue.inviterId)
      ? {
          inviterId: Number(pendingValue.inviterId),
          payload: String(pendingValue.payload || `ref_${pendingValue.inviterId}`),
        }
      : null;
    const referral = signedReferral || pendingReferral;
    const deviceCheck = await assessAndRegisterReferralDevice({
      supabase,
      request,
      userId: invitedId,
      deviceToken: auth.body?.deviceToken,
      deviceInfo: auth.body?.deviceInfo,
    });

    if (!referral?.inviterId) {
      return Response.json({
        ok: true,
        tracked: false,
        deviceRegistered: Boolean(deviceCheck.ok && !deviceCheck.blocked),
        reason: 'referal pending topilmadi',
      });
    }

    if (referral.inviterId === invitedId) {
      await supabase.from('app_settings').delete().eq('key', pendingKey);
      return Response.json({
        ok: true,
        tracked: false,
        reason: 'self referral ignored',
      });
    }

    if (!deviceCheck.ok && deviceCheck.reason === 'DEVICE_TOKEN_REQUIRED') {
      return jsonError(
        'Qurilma tekshiruvi yakunlanmadi. Web Appni qayta oching.',
        400,
        { reason: deviceCheck.reason }
      );
    }

    if (deviceCheck.blocked) {
      await Promise.all([
        saveReferralAudit(supabase, {
          invitedId,
          inviterId: referral.inviterId,
          status: 'blocked',
          reason: deviceCheck.reason,
        }),
        supabase.from('app_settings').delete().eq('key', pendingKey),
      ]);

      return Response.json({
        ok: true,
        tracked: false,
        blocked: true,
        reason: deviceCheck.reason,
        message: 'Bu qurilmada boshqa Telegram akkaunti aniqlangani uchun referal bonusi berilmaydi.',
      });
    }

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

    await Promise.all([
      saveReferralAudit(supabase, {
        invitedId,
        inviterId: referral.inviterId,
        status: data?.claimed ? 'accepted' : 'existing',
        reason: data?.claimed ? 'DEVICE_VERIFIED' : 'ALREADY_CLAIMED',
      }),
      supabase.from('app_settings').delete().eq('key', pendingKey),
    ]);

    return Response.json({
      ok: true,
      tracked: Boolean(data?.claimed),
      deviceVerified: true,
      referral: data || null,
    });
  } catch (error) {
    console.error('[referral:startapp]', error);

    return jsonError(error.message || 'Referal startapp xatosi', 500);
  }
}
