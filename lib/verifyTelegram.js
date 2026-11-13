import crypto from 'crypto';

export function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (typeof initData !== 'string' || !initData || initData.length > 16384 || !botToken) {
    return { ok: false, error: 'initData yoki TELEGRAM_BOT_TOKEN topilmadi' };
  }

  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return { ok: false, error: 'Takroriy Telegram maydoni.' };
  const hash = params.get('hash');

  if (!hash) {
    return { ok: false, error: 'hash topilmadi' };
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!safeEqualHex(hash, calculatedHash)) {
    return { ok: false, error: 'Telegram initData hash noto‘g‘ri' };
  }

  const authDate = Number(params.get('auth_date'));

  maxAgeSeconds = Number.isSafeInteger(maxAgeSeconds) ? Math.max(60, Math.min(maxAgeSeconds, 86400)) : 86400;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(authDate) || authDate <= 0 || authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) {
    return { ok: false, error: 'initData muddati tugagan' };
  }

  let user = null;
  const userRaw = params.get('user');

  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      user = null;
    }
  }

  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, error: 'Telegram user ID noto‘g‘ri.' };
  return { ok: true, user, auth_date: authDate, startParam: params.get('start_param') || '' };
}

function safeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(String(a || '')) || !/^[a-f0-9]{64}$/i.test(String(b || ''))) return false;

  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');

  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}
