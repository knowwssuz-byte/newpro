import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="badge">PHP Bot + Vercel Web App</div>
        <h1>Telegram Web App Vercel’da ishlaydi</h1>
        <p>
          Bu Next.js loyiha faqat Web App uchun. Telegram bot webhook esa boshqa serverdagi PHP faylga ulanadi.
        </p>

        <div className="actions">
          <Link className="button" href="/webapp">
            /webapp sahifani ochish
          </Link>
        </div>

        <div className="grid three">
          <div className="card">
            <strong>PHP server</strong>
            <p>Telegram webhook, /start, tugmalar va web_app_data shu serverda ishlaydi.</p>
          </div>
          <div className="card">
            <strong>Vercel</strong>
            <p>Next.js Mini App UI, admin panel va frontend sahifalar shu yerda turadi.</p>
          </div>
          <div className="card">
            <strong>Security</strong>
            <p>Telegram initData serverda hash orqali tekshiriladi.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
