import { headers } from 'next/headers';
import WebAppClient from './WebAppClient';
import TonConnectProvider from './TonConnectProvider';

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

export default async function WebAppPage() {
  const requestHeaders = await headers();
  const configuredOrigin = cleanOrigin(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  );
  const forwardedHost =
    requestHeaders.get('x-forwarded-host') ||
    requestHeaders.get('host') ||
    'localhost:3000';
  const forwardedProtocol =
    requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (forwardedHost.includes('localhost') ? 'http' : 'https');
  const origin =
    configuredOrigin ||
    cleanOrigin(`${forwardedProtocol}://${forwardedHost}`);
  const configuredReturnUrl = String(
    process.env.NEXT_PUBLIC_TONCONNECT_TWA_RETURN_URL || ''
  ).trim();

  return (
    <TonConnectProvider
      manifestUrl={`${origin}/api/tonconnect-manifest?v=3`}
      twaReturnUrl={configuredReturnUrl}
    >
      <WebAppClient />
    </TonConnectProvider>
  );
}
