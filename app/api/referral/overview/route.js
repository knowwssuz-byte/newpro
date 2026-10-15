import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A short per-instance cache prevents duplicate refetches during tab changes.
// The single database RPC returns stats + friend names + settings in one roundtrip.
const TTL_MS = 30_000;
const overviewCache = globalThis.__giftMystReferralFastCache || new Map();
globalThis.__giftMystReferralFastCache = overviewCache;

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);
    const userId = Number(auth.telegramUser.id);
    const user = await ensureUser(auth.telegramUser);
    if (user.is_banned) return jsonError('Siz bloklangansiz', 403);

    const cached = overviewCache.get(userId);
    if (cached && Date.now() - cached.savedAt < TTL_MS) {
      return Response.json({ ok: true, referral: { ...cached.referral, balance: Math.max(0, Number(user.balance) || 0) } });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('referral_overview_fast', { p_user_id: userId });
    if (error) {
      if (error.code === 'PGRST202' || String(error.message).includes('referral_overview_fast')) {
        return jsonError('Referal ma’lumotlari yangilanmoqda. Keyinroq qayta urinib ko‘ring.', 503);
      }
      throw error;
    }

    const referral = {
      ...data,
      balance: Math.max(0, Number(user.balance) || 0),
      friends: Array.isArray(data?.friends) ? data.friends : [],
    };

    overviewCache.set(userId, { savedAt: Date.now(), referral });
    if (overviewCache.size > 500) {
      const oldest = overviewCache.keys().next().value;
      overviewCache.delete(oldest);
    }

    return Response.json({ ok: true, referral }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[referral:overview]', error);
    return jsonError('Referal statistikasini yuklab bo‘lmadi', 500);
  }
}
