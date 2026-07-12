export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const bytes = await upstream.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
      return Response.json({ ok: false, error: 'Animation fayli bo‘sh yoki juda katta' }, { status: 422 });
    }
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/x-tgsticker',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json({ ok: false, error: 'Animation yuklanmadi' }, { status: 502 });
  }
}
