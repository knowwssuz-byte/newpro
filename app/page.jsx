import Link from 'next/link';

const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'GiftMystBot';
const telegramUrl = `https://t.me/${botUsername.replace('@', '')}`;

function TelegramIcon() {
  return (
    <svg className="landing-telegram-svg" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="120" cy="120" r="112" fill="url(#telegramBg)" />
      <path
        d="M173.7 72.8c2.3-1 4.9 1 4.3 3.5l-22.2 104.6c-.5 2.3-3.3 3.2-5.1 1.7l-31-25.5-17.1 16.5c-1.9 1.9-5.1.9-5.7-1.8l-8.1-36.7-30.5-10.1c-2.7-.9-2.9-4.7-.2-5.9l115.6-46.3Z"
        fill="white"
      />
      <path
        d="M94.2 133.8 152.5 96c1.2-.8 2.5.8 1.5 1.8l-48.2 46.5-1.9 22.1-9.7-32.6Z"
        fill="#BFEAFF"
      />
      <defs>
        <linearGradient id="telegramBg" x1="46" y1="36" x2="198" y2="202" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="landing-page">
      <section className="landing-shell">
        <div className="landing-glow one" />
        <div className="landing-glow two" />

        <div className="landing-brand">
          <span>Gift Myst</span>
          <strong>Telegram Web App</strong>
        </div>

        <div className="landing-card">
          <a className="telegram-hero-icon" href={telegramUrl} target="_blank" rel="noreferrer" aria-label="Telegram botni ochish">
            <TelegramIcon />
          </a>

          <h1>Gift Myst botini Telegramda oching</h1>
          <p>
            Web App faqat Telegram ichida to‘liq ishlaydi. Pastdagi ikonka yoki linkni bossangiz bot Telegramda ochiladi.
          </p>

          <a className="landing-bot-link" href={telegramUrl} target="_blank" rel="noreferrer">
            @{botUsername.replace('@', '')}
          </a>

          <div className="landing-actions">
            <a className="landing-primary-btn" href={telegramUrl} target="_blank" rel="noreferrer">
              Telegramda ochish
            </a>

            <Link className="landing-secondary-btn" href="/webapp">
              WebApp sahifa
            </Link>
          </div>
        </div>

        <div className="landing-admin-card">
          <div>
            <span className="landing-admin-badge">Secure admin</span>
            <h2>Admin panel</h2>
            <p>
              Bot ichida admin ochilmasa, shu brauzer sahifasidan maxfiy kalit bilan xavfsiz kirish mumkin.
            </p>
          </div>

          <Link className="landing-admin-btn" href="/admin">
            Admin panelni ochish
          </Link>
        </div>
      </section>
    </main>
  );
}
