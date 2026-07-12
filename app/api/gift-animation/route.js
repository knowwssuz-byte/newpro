export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { gunzipSync } from 'zlib';

function allowedStorageUrl(rawUrl) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const bucket = process.env.SUPABASE_GIFT_ASSETS_BUCKET || 'gift-assets';
  if (!supabaseUrl || !rawUrl) return null;

  try {
    const source = new URL(rawUrl);
    const expected = new URL(supabaseUrl);
    const prefix = `/storage/v1/object/public/${bucket}/`;
    if (source.protocol !== 'https:' || source.hostname !== expected.hostname || !source.pathname.startsWith(prefix)) return null;
    return source;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const source = allowedStorageUrl(new URL(request.url).searchParams.get('url'));
  if (!source) return Response.json({ ok: false, error: 'Animation URL ruxsat etilmagan' }, { status: 400 });

  try {
    const upstream = await fetch(source, { cache: 'force-cache', next: { revalidate: 86400 } });
    if (!upstream.ok) return Response.json({ ok: false, error: `Animation topilmadi (${upstream.status})` }, { status: 502 });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
      return Response.json({ ok: false, error: 'Animation fayli bo‘sh yoki juda katta' }, { status: 422 });
    }

    let jsonBytes = bytes;
    try {
      jsonBytes = gunzipSync(bytes);
    } catch {
      // Eski yozuvlar oddiy JSON bo‘lishi mumkin.
    }

    let animationData;
    try {
      animationData = JSON.parse(jsonBytes.toString('utf8'));
    } catch {
      return Response.json({ ok: false, error: 'TGS ichidagi JSON yaroqsiz' }, { status: 422 });
    }

    if (!animationData || !Array.isArray(animationData.layers)) {
      return Response.json({ ok: false, error: 'Lottie layers topilmadi' }, { status: 422 });
    }

    return Response.json({ ok: true, animationData }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json({ ok: false, error: 'Animation yuklanmadi' }, { status: 502 });
  }
}
