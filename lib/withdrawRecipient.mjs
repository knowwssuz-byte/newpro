/**
 * Telegram public usernames contain 5-32 ASCII letters, numbers and underscores.
 * We never accept links, chat IDs, whitespace, HTML or email addresses here.
 */
export const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export function normalizeTelegramUsername(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const raw = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return TELEGRAM_USERNAME_PATTERN.test(raw) ? raw : '';
}

export function validateWithdrawalRecipient({ mode, username, verifiedUsername }) {
  if (mode !== 'self' && mode !== 'other') {
    return { ok: false, error: 'Qabul qiluvchini tanlang: o‘zimga yoki boshqaga.' };
  }
  const verified = normalizeTelegramUsername(verifiedUsername);
  // Never trust a user-input username when authenticated Telegram supplied one
  // and "self" was chosen: the actual owner takes priority.
  if (mode === 'self' && verified) {
    return { ok: true, mode, username: verified, source: 'telegram' };
  }
  const entered = normalizeTelegramUsername(username);
  if (!entered) {
    return {
      ok: false,
      error: 'Telegram @username kiriting (5–32 belgi, lotin harflari, raqam yoki _).',
    };
  }
  return { ok: true, mode, username: entered, source: 'entered' };
}

export function recipientLabel(request) {
  const username = normalizeTelegramUsername(request?.recipient_username);
  return username ? '@' + username : 'Qabul qiluvchi ko‘rsatilmagan';
}
