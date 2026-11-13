import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { contentSecurityPolicy } from './lib/security/csp.mjs';

export function proxy(request) {
  const nonce = crypto.randomBytes(24).toString('base64');
  const csp = contentSecurityPolicy(nonce, {
    admin: /^\/(admin|onlines)(\/|$)/.test(request.nextUrl.pathname),
    development: process.env.NODE_ENV !== 'production',
  });
  const headers = new Headers(request.headers);
  // Overwrite incoming values; clients never choose the script nonce.
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/', '/webapp/:path*', '/admin/:path*', '/onlines/:path*', '/cases-preview/:path*'] };
