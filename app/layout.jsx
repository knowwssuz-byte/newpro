import './globals.css';

export const metadata = {
  title: 'Case Arena Web App',
  description: 'Premium Telegram case opening web app',
};

export default function RootLayout({ children }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
