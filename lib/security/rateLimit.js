import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { HttpError, assertSameOrigin } from './http.mjs';

export function clientIp(request) {
  // Vercel overwrites this header. Never trust client-supplied forwarding
  // headers on a self-hosted deployment without a trusted ingress.
  if (process.env.VERCEL !== '1') return 'local';
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return isIP(ip) ? ip : 'unknown';
}

export async function enforceRate(scope, identity, limit, windowSeconds) {
  const secret = process.env.ADMIN_PANEL_KEY || process.env.TELEGRAM_BOT_TOKEN;
  if (!secret) throw new HttpError(503, 'Xavfsizlik xizmati sozlanmagan.');
  const key = crypto.createHmac('sha256', secret).update(`${scope}:${identity}`).digest('hex');
  try {
    const { data, error } = await getSupabaseAdmin().rpc('newpro_consume_rate_limit', {
      p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
    });
    if (error || !data || typeof data.allowed !== 'boolean') throw Error('rate_backend');
    if (!data.allowed) throw new HttpError(429, 'So‘rovlar juda ko‘p. Biroz kuting.', data.retry_after || windowSeconds);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // No per-instance fallback: restarting a function must not reset protection.
    console.error('[security:rate]', 'backend_unavailable');
    throw new HttpError(503, 'Xavfsizlik tekshiruvi vaqtincha ishlamayapti.');
  }
}

export async function guardRequest(request, { limit = 1800, windowSeconds = 60, scope = 'api', sameOrigin = false } = {}) {
  assertSameOrigin(request, sameOrigin);
  await enforceRate(scope, clientIp(request), limit, windowSeconds);
}
