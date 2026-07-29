export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanOrigin(value = '') {
  const text = String(value || '').trim().replace(/\/+$/, '');

  if (!text) return '';

  try {
    return new URL(
      /^https?:\/\//i.test(text) ? text : `https://${text}`
    ).origin;
  } catch {
    return '';
  }
}

export async function GET(request) {
  const configuredOrigin = cleanOrigin(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  );
  const requestUrl = new URL(request.url);
  const forwardedHost = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    requestUrl.host
  ).split(',')[0].trim();
  const forwardedProtocol = (
    request.headers.get('x-forwarded-proto') ||
    requestUrl.protocol.replace(':', '') ||
    'https'
  ).split(',')[0].trim();
  const requestOrigin = cleanOrigin(
    `${forwardedProtocol}://${forwardedHost}`
  );
  const origin = configuredOrigin || requestOrigin || requestUrl.origin;

  return Response.json(
    {
      url: origin,
      name: 'Gift Myst',
      iconUrl: `${origin}/tonconnect-icon.png`,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
