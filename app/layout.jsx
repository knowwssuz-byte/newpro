import './globals.css';
import './webapp/professional-theme.css';
import './webapp/premium-polish.css';
import './webapp/gift-once.css';
import './admin/dice-stats.css';
import './webapp/compact-shell.css';
import './typography.css';
import { Manrope, Outfit } from 'next/font/google';
import Script from 'next/script';

// Variable families are downloaded during build and served from the NewPro domain.
const manrope = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-manrope', display: 'swap' });
const outfit = Outfit({ subsets: ['latin', 'latin-ext'], variable: '--font-outfit', display: 'swap' });

export const metadata = {
  title: 'Gift Myst',
  description: 'Premium Telegram WebApp case opening',
};

export default function RootLayout({ children }) {
  return (
    <html lang="uz" className={`${manrope.variable} ${outfit.variable}`}>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="myst-version-recovery" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: `
(function(){
  if (!/^\\/webapp(?:\\/|$)/.test(location.pathname)) return;
  function recover(event) {
    var target = event && event.target;
    var source = (target && (target.src || target.href)) || '';
    var reason = String((event && (event.message || (event.reason && event.reason.message))) || '');
    var chunkFailed = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(reason);
    var staleNextAsset = source.indexOf('/_next/static/') !== -1 && target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK');
    if (!chunkFailed && !staleNextAsset) return;
    try {
      var key = 'myst_recover_chunk_once';
      var last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 600000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch { return; }
    var url = new URL(location.href);
    url.searchParams.set('myst_recover', '1');
    location.replace(url.toString());
  }
  addEventListener('error', recover, true);
  addEventListener('unhandledrejection', recover);
})();
` }} />
        {children}
      </body>
    </html>
  );
}