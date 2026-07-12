import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Gift Myst',
  description: 'Premium Telegram WebApp case opening',
};

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
