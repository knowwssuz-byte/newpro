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
        {children}
      </body>
    </html>
  );
}