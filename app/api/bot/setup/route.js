import { setupTelegramBot } from '@/lib/telegramBot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || '';
  const expectedSecret =
    String(process.env.BOT_SETUP_SECRET || '').trim() ||
    String(process.env.BOT_WEBHOOK_SECRET || '').trim();

  if (expectedSecret && secret !== expectedSecret) {
    return json({ ok: false, error: 'Setup secret noto‘g‘ri' }, 401);
  }

  try {
    const result = await setupTelegramBot();

    return json({
      ok: true,
      message: 'Bot webhook, menu button va commands sozlandi.',
      ...result,
    });
  } catch (error) {
    console.error('[bot:setup]', error);

    return json(
      {
        ok: false,
        error: error?.message || 'Bot setup xatosi',
      },
      500
    );
  }
}
