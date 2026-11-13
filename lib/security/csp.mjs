export function contentSecurityPolicy(nonce, { admin = false, development = false } = {}) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://telegram.org${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    // Existing React styles, Lottie and TON Connect require inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: data: https:",
    "connect-src 'self' https: wss:" + (development ? ' ws:' : ''),
    "worker-src 'self' blob:",
    "frame-src 'self' https://connect.tonhub.com https://*.tonconnect.org",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    admin ? "frame-ancestors 'none'" : "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
