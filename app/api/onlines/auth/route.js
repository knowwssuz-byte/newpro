import { NextResponse } from 'next/server';
import { ONLINE_ADMIN_COOKIE, createOnlineAdminCookie, validAdminKey } from '@/lib/onlinesAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStore(data, status = 200) {
  return NextResponse.json(data, { status, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'
  } });
}
export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return noStore({ok:false,error:'Origin ruxsat etilmagan'},403);
  const body = await request.json().catch(()=>({}));
  if (body.action === 'logout') {
    const response = noStore({ok:true});
    response.cookies.delete(ONLINE_ADMIN_COOKIE);
    return response;
  }
  if (body.action !== 'login' || !validAdminKey(body.key)) {
    return noStore({ok:false,error:'Admin kalit noto‘g‘ri'},401);
  }
  const session = createOnlineAdminCookie();
  const response = noStore({ok:true});
  response.cookies.set(ONLINE_ADMIN_COOKIE, session.value, {
    httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict',
    path:'/', maxAge:session.maxAge,
  });
  return response;
}
