import { handleTelegramUpdate } from '@/lib/telegramBot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET() {
  return json({
    ok: true,
    route: '/api/bot',
    message: 'Gift Myst Telegram bot webhook route ishlayapti.',
  });
}

export async function POST(request) {
  const expectedSecret = String(process.env.BOT_WEBHOOK_SECRET || '').trim();

  if (expectedSecret) {
    const incomingSecret = request.headers.get('x-telegram-bot-api-secret-token') || '';

    if (incomingSecret !== expectedSecret) {
      return json({ ok: false, error: 'Webhook secret noto‘g‘ri' }, 401);
    }
  }

  try {
    const update = await request.json();
    await handleTelegramUpdate(update);

    return json({ ok: true });
  } catch (error) {
    console.error('[bot:webhook]', error);

    // Telegram qayta-qayta yuborib spam qilmasligi uchun 200 qaytaramiz.
    return json({
      ok: true,
      handled: false,
      error: error?.message || 'Bot webhook xatosi',
    });
  }
}
