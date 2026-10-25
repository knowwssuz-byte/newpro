'use client';

import { useEffect } from 'react';

// Last-resort UI for React render errors (including malformed cached data).
// This route-level boundary does not touch user balances, inventory or auth.
export default function WebAppError({ error, reset }) {
  useEffect(() => {
    // Keep details in the browser console only; don't send Telegram auth data.
    console.error('[MYST] WebApp startup/render error', error);
  }, [error]);

  const recover = () => {
    // Bypass only our short-lived bootstrap snapshot on the next page load.
    // Immutable Next.js assets will be reselected from current route HTML.
    const url = new URL('/webapp', window.location.origin);
    url.searchParams.set('myst_recover', '1');
    window.location.replace(url.toString());
  };

  return (
    <main role="alert" aria-label="MYST ishga tushmadi" style={{
      width: '100%', minHeight: '100dvh', display: 'grid', placeItems: 'center',
      background: '#080911', color: '#f5f0ff', padding: '20px',
      fontFamily: 'system-ui,-apple-system,sans-serif',
    }}>
      <section style={{ width: 'min(100%,360px)', textAlign: 'center' }}>
        <strong style={{ display: 'block', fontSize: '36px', letterSpacing: '.16em' }}>MYST</strong>
        <p style={{ color: '#cbc4d7', fontSize: '13px', lineHeight: 1.6 }}>
          Ilovani ochishda xatolik yuz berdi. Qayta urining yoki yangi yuklashni tanlang.
        </p>
        <button type="button" onClick={reset} style={{
          width: '100%', minHeight: '46px', marginBottom: '9px',
          background: '#8b64c2', color: 'white', border: 0, borderRadius: '12px',
          fontWeight: 700, fontSize: '14px',
        }}>Qayta urinish</button>
        <button type="button" onClick={recover} style={{
          width: '100%', minHeight: '46px', borderRadius: '12px',
          border: '1px solid #584672', background: '#1a1525', color: 'white',
          fontWeight: 700, fontSize: '14px',
        }}>Yangidan yuklash</button>
      </section>
    </main>
  );
}
