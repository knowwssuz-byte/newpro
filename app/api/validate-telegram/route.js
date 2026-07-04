import { NextResponse } from 'next/server';
import { verifyTelegramInitData } from '@/lib/verifyTelegram';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { initData } = await request.json();
    const result = verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);

    if (!result.ok) {
      return NextResponse.json(result, { status: 401 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
