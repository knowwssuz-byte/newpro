import './globals.css';

export const metadata = {
  title: 'Gift Myst',
  description: 'Premium Telegram WebApp case opening',
};

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body>{children}</body>
    </html>
  );
}
