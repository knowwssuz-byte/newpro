import crypto from 'node:crypto';

export const ONLINE_ADMIN_COOKIE = 'newpro_online_admin';
const SESSION_SECONDS = 60 * 60 * 8;
const PURPOSE = 'newpro-onlines-admin-v1:';

function secret() {
  const key = process.env.ADMIN_PANEL_KEY?.trim() || '';
  return key.length >= 16 ? key : '';
}
function sign(value) {
  return crypto.createHmac('sha256', PURPOSE + secret()).update(value).digest('hex');
}
export function validAdminKey(key) {
  const expected = secret();
  if (!expected || typeof key !== 'string') return false;
  const a = crypto.createHash('sha256').update(key).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a,b);
}
export function createOnlineAdminCookie() {
  if (!secret()) throw new Error('ADMIN_PANEL_KEY sozlanmagan');
  const expiresAt = Math.floor(Date.now()/1000) + SESSION_SECONDS;
  const payload = expiresAt + '.' + crypto.randomBytes(16).toString('hex');
  return { value:payload+'.'+sign(payload), maxAge:SESSION_SECONDS };
}
export function isOnlineAdmin(cookie) {
  if (!secret() || typeof cookie !== 'string') return false;
  const match = cookie.match(/^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/);
  if (!match) return false;
  const expires = Number(match[1]);
  const now = Math.floor(Date.now()/1000);
  if (expires < now || expires > now + SESSION_SECONDS + 10) return false;
  const expected = Buffer.from(sign(match[1]+'.'+match[2]),'hex');
  const actual = Buffer.from(match[3],'hex');
  return crypto.timingSafeEqual(expected,actual);
}
