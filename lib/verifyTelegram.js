import crypto from 'crypto';

export function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) {
    return { ok: false, error: 'initData yoki TELEGRAM_BOT_TOKEN topilmadi' };
  }

  const params = new URLSearchParams(initData);
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

  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
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

  return { ok: true, user, auth_date: authDate };
}

function safeEqualHex(a, b) {
  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');

  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}
