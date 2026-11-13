import { allowedAnimationUrl, fetchAnimation } from '@/lib/security/assets.mjs';
import { guardRequest } from '@/lib/security/rateLimit';
import { HttpError, securityError } from '@/lib/security/http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const source = allowedAnimationUrl(new URL(request.url).searchParams.get('url'),
      process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_GIFT_ASSETS_BUCKET || 'gift-assets');
    if (!source) throw new HttpError(400, 'Animation URL ruxsat etilmagan.');
    await guardRequest(request, { scope: 'animations', limit: 240 });
    const animationData = await fetchAnimation(source);
    return Response.json({ ok: true, animationData }, { headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return securityError(error); }
}
