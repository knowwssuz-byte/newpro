import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

function clean(value = '') {
  return String(value || '').trim();
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function timingSafeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(String(a || '')) || !/^[a-f0-9]{64}$/i.test(String(b || ''))) return false;

  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

function getBotToken() {
  const token = clean(process.env.TELEGRAM_BOT_TOKEN);

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN env topilmadi');
  }

  return token;
}

function parseInitData(initData = '') {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) {
    throw new Error('Telegram initData hash topilmadi');
  }

  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  return {
    params,
    hash,
    dataCheckString,
    user: safeJsonParse(params.get('user') || ''),
    authDate: Number(params.get('auth_date') || 0),
    startParam: params.get('start_param') || '',
  };
}

export function verifyTelegramInitData(initData = '') {
  const cleanInitData = clean(initData);

  if (!cleanInitData) {
    throw new Error('Telegram initData kelmadi');
  }

  const token = getBotToken();
  const parsed = parseInitData(cleanInitData);

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(parsed.dataCheckString)
    .digest('hex');

  if (!timingSafeEqualHex(computedHash, parsed.hash)) {
    throw new Error('Telegram initData noto‘g‘ri');
  }

  const maxAgeSeconds = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 60 * 60 * 24 * 30);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(parsed.authDate) || parsed.authDate <= 0) {
    throw new Error('Telegram auth_date topilmadi');
  }

  if (parsed.authDate > nowSeconds + 30) {
    throw new Error('Telegram auth_date noto‘g‘ri');
  }

  if (maxAgeSeconds > 0) {
    const ageSeconds = nowSeconds - parsed.authDate;

    if (ageSeconds > maxAgeSeconds) {
      throw new Error('Telegram initData muddati tugagan');
    }
  }

  if (!parsed.user?.id) {
    throw new Error('Telegram user topilmadi');
  }

  return {
    user: parsed.user,
    startParam: parsed.startParam,
    authDate: parsed.authDate,
    initData: cleanInitData,
  };
}

async function readBody(request) {
  const text = await request.text();

  if (!text) return {};

  const json = safeJsonParse(text);

  if (json && typeof json === 'object') return json;

  return {};
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
      error: message,
      ...extra,
    },
    { status }
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
    const body = await readBody(request);
    const initData = extractInitData(request, body);
    const verified = verifyTelegramInitData(initData);

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
      status: 401,
      error: error?.message || 'Telegram auth xatosi',
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

  return data;
}
