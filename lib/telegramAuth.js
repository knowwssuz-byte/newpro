import { verifyTelegramInitData as verifySignedInitData } from './verifyTelegram.js';
import { HttpError, readJson } from './security/http.mjs';
import { guardRequest, enforceRate } from './security/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendSignupNotice } from '@/lib/signupNotice';

export const runtime = 'nodejs';

function clean(value = '') {
  return String(value || '').trim();
}

function getBotToken() {
  const token = clean(process.env.TELEGRAM_BOT_TOKEN);

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN env topilmadi');
  }

  return token;
}

export function verifyTelegramInitData(initData = '') {
  const result = verifySignedInitData(initData, getBotToken(), Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 86400));
  if (!result.ok) throw new HttpError(401, result.error);
  return { user: result.user, authDate: result.auth_date, startParam: result.startParam, initData };
}

function extractInitData(request, body = {}) {
  return (
    request.headers.get('x-telegram-init-data') ||
    request.headers.get('x-telegram-initdata') ||
    request.headers.get('telegram-init-data') ||
    body.initData ||
    body._initData ||
    body.telegramInitData ||
    ''
  );
}

function getAdminIds() {
  return clean(process.env.ADMIN_IDS)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function jsonError(message = 'Xatolik', status = 400, extra = {}) {
  return Response.json(
    {
      ok: false,
      error: status >= 500 ? 'Server xizmati vaqtincha mavjud emas. Qayta urinib ko‘ring.' : message,
      ...extra,
    },
    { status, headers: { 'Cache-Control': 'private, no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) } }
  );
}

export function isAdminUser(userOrId) {
  const userId =
    typeof userOrId === 'object'
      ? userOrId?.id || userOrId?.user?.id || userOrId?.telegramUser?.id
      : userOrId;

  if (!userId) return false;

  return getAdminIds().includes(String(userId));
}

export async function readTelegramRequest(request) {
  try {
    await guardRequest(request);
    const body = await readJson(request);
    const initData = extractInitData(request, body);
    const verified = verifyTelegramInitData(initData);
    await enforceRate('telegram-user', String(verified.user.id), 360, 60);
    const path = new URL(request.url).pathname;
    const action = String(body.action || '');
    if (['/api/open-case','/api/sell-gift','/api/withdraw','/api/upgrade'].includes(path) ||
        ['play','join','bet','stake','claim','create'].includes(action)) {
      await enforceRate('telegram-mutation', String(verified.user.id), 60, 60);
    }

    return {
      ok: true,
      body,
      initData: verified.initData,
      telegramUser: verified.user,
      startParam: verified.startParam,
      authDate: verified.authDate,
      isAdmin: isAdminUser(verified.user),
    };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof HttpError ? error.status : 401,
      error: error instanceof HttpError ? error.message : 'Telegram auth xatosi',
      body: {},
    };
  }
}

export async function ensureUser(telegramUser) {
  if (!telegramUser?.id) {
    throw new Error('Telegram user id topilmadi');
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        id: Number(telegramUser.id),
        first_name: telegramUser.first_name || null,
        username: telegramUser.username || null,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await sendSignupNotice(data);
  return data;
}
