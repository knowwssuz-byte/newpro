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

  let update = null;

  try {
    update = await request.json();
    await handleTelegramUpdate(update);

    return json({ ok: true });
  } catch (error) {
    console.error('[bot:webhook]', error);

    const criticalPaymentUpdate = Boolean(
      update?.pre_checkout_query ||
        update?.message?.successful_payment ||
        update?.message?.gift ||
        update?.message?.unique_gift ||
        update?.business_message?.gift ||
        update?.business_message?.unique_gift
    );

    // Moliyaviy update muvaffaqiyatsiz bo'lsa Telegram uni qayta yuborishi
    // kerak. Oddiy command xatosida esa takroriy spamning oldini olamiz.
    return json({
      ok: !criticalPaymentUpdate,
      handled: false,
      error: error?.message || 'Bot webhook xatosi',
    }, criticalPaymentUpdate ? 500 : 200);
  }
}
