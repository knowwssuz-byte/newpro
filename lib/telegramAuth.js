import { verifyTelegramInitData } from '@/lib/verifyTelegram';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export function getAdminIds() {
  return String(process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdminUser(userId) {
  if (!userId) return false;
  return getAdminIds().includes(String(userId));
}

export async function readTelegramRequest(request) {
  const body = await request.json();
  const initData = body?.initData;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!initData || !botToken) {
    return {
      ok: false,
      status: 400,
      error: 'initData yoki TELEGRAM_BOT_TOKEN topilmadi',
      body,
    };
  }

  const result = verifyTelegramInitData(initData, botToken);

  if (!result.ok) {
    return {
      ok: false,
      status: 401,
      error: result.error || result.reason || 'Telegram initData noto‘g‘ri',
      body,
    };
  }

  if (!result.user?.id) {
    return {
      ok: false,
      status: 401,
      error: 'Telegram user topilmadi',
      body,
    };
  }

  return {
    ok: true,
    body,
    telegramUser: result.user,
    isAdmin: isAdminUser(result.user.id),
  };
}

export async function ensureUser(telegramUser) {
  const supabase = getSupabaseAdmin();

  const payload = {
    id: telegramUser.id,
    first_name: telegramUser.first_name || null,
    username: telegramUser.username || null,
  };

  const { error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'id' });

  if (error) throw new Error(error.message);

  const { data, error: selectError } = await supabase
    .from('users')
    .select('*')
    .eq('id', telegramUser.id)
    .single();

  if (selectError) throw new Error(selectError.message);

  return data;
}

export function jsonError(message, status = 400, extra = {}) {
  return Response.json(
    {
      ok: false,
      error: message,
      ...extra,
    },
    { status }
  );
}
