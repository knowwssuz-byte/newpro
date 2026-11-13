import crypto from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { HttpError, assertSameOrigin } from './http.mjs';

export const ADMIN_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-newpro_admin' : 'newpro_admin';
export const SESSION_SECONDS = 8 * 60 * 60;
const key = () => String(process.env.ADMIN_PANEL_KEY || '').trim();
export function validAdminKey(provided) {
  if (!key() || typeof provided !== 'string' || provided.length > 1024) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(provided).digest(), crypto.createHash('sha256').update(key()).digest());
}
export function sessionHash(token) {
  if (!key() || !/^[a-f0-9]{64}$/.test(token || '')) return null;
  return crypto.createHmac('sha256', key()).update('newpro-admin-session-v1:' + token).digest('hex');
}
export function cookieToken(request) {
  return request.cookies?.get(ADMIN_COOKIE)?.value ||
    (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(ADMIN_COOKIE + '='))?.slice(ADMIN_COOKIE.length + 1) || '';
}
export async function validSession(token) {
  const tokenHash = sessionHash(token);
  if (!tokenHash) return false;
  const { data, error } = await getSupabaseAdmin().from('admin_sessions').select('token_hash')
    .eq('token_hash', tokenHash).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new HttpError(503, 'Sessiyani tekshirib bo‘lmadi.');
  return Boolean(data);
}
export async function assertAdminSession(request) {
  assertSameOrigin(request, true);
  if (!await validSession(cookieToken(request))) throw new HttpError(401, 'Admin sessiyasi tugagan. Qayta kiring.');
}
export async function createSession() {
  if (!key()) throw new HttpError(503, 'Admin kirishi sozlanmagan.');
  const token = crypto.randomBytes(32).toString('hex');
  const { error } = await getSupabaseAdmin().from('admin_sessions').insert({
    token_hash: sessionHash(token), expires_at: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
  });
  if (error) throw new HttpError(503, 'Sessiyani yaratib bo‘lmadi.');
  return token;
}
export async function revokeSession(token) {
  const tokenHash = sessionHash(token);
  if (!tokenHash) return;
  const { error } = await getSupabaseAdmin().from('admin_sessions').delete().eq('token_hash', tokenHash);
  if (error) throw new HttpError(503, 'Sessiyani yopib bo‘lmadi. Qayta urining.');
}
export function setSessionCookie(response, token) {
  response.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/', maxAge: token ? SESSION_SECONDS : 0 });
  // Invalidate the older, separate dashboard cookie.
  response.cookies.set('newpro_online_admin', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}
