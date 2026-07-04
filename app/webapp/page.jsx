import Script from 'next/script';
import WebAppClient from './WebAppClient';

export const metadata = {
  title: 'Telegram Web App',
};

export default function WebAppPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <WebAppClient />
    </>
  );
}
