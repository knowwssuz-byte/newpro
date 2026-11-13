import { NextResponse } from 'next/server';
import { cookieToken, createSession, revokeSession, setSessionCookie, validAdminKey, validSession } from '@/lib/security/adminSession';
import { guardRequest, enforceRate, clientIp } from '@/lib/security/rateLimit';
import { HttpError, readJson, securityError } from '@/lib/security/http.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data) => NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request) {
  try {
    await guardRequest(request);
    const authenticated = await validSession(cookieToken(request));
    return json({ ok: true, authenticated });
  } catch (error) { return securityError(error); }
}

export async function POST(request) {
  try {
    await guardRequest(request, { sameOrigin: true });
    const body = await readJson(request, 4096);
    if (body.action === 'logout') {
      await revokeSession(cookieToken(request));
      return setSessionCookie(json({ ok: true }), '');
    }
    if (body.action !== 'login') throw new HttpError(400, 'Noto‘g‘ri amal.');
    // Both admin screens share the same persistent brute-force budget.
    await enforceRate('admin-login', clientIp(request), 10, 900);
    if (!validAdminKey(body.key)) throw new HttpError(401, 'Admin kalit noto‘g‘ri.');
    const token = await createSession();
    await revokeSession(cookieToken(request));
    return setSessionCookie(json({ ok: true }), token);
  } catch (error) { return securityError(error); }
}
