import crypto from 'crypto';

const SIGNED_PREFIX = 'gm1';
const SIGNATURE_HEX_LENGTH = 32;
const LEGACY_PAYLOAD_PATTERN = /^deposit:([0-9a-f-]{36})$/i;
const SIGNED_PAYLOAD_PATTERN =
  /^gm1\.([0-9a-f]{32})\.([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-f]{32})$/i;

function clean(value = '') {
  return String(value ?? '').trim();
}

function invoiceSecret() {
  const secret =
    clean(process.env.STARS_INVOICE_SECRET) ||
    clean(process.env.TELEGRAM_BOT_TOKEN);

  if (!secret) {
    throw new Error(
      'STARS_INVOICE_SECRET yoki TELEGRAM_BOT_TOKEN env topilmadi.'
    );
  }

  return secret;
}

function uuidToHex(value = '') {
  const hex = clean(value).replaceAll('-', '').toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error('Stars deposit ID noto‘g‘ri.');
  }

  return hex;
}

function hexToUuid(value = '') {
  const hex = clean(value).toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(hex)) return '';

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function safeInteger(value, label) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} noto‘g‘ri.`);
  }

  return parsed;
}

function fromBase36(value = '') {
  const text = clean(value).toLowerCase();

  if (!/^[0-9a-z]+$/.test(text)) return null;

  const parsed = Number.parseInt(text, 36);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function signature(core) {
  return crypto
    .createHmac('sha256', invoiceSecret())
    .update(core)
    .digest('hex')
    .slice(0, SIGNATURE_HEX_LENGTH);
}

function signatureMatches(actual, expected) {
  if (
    !new RegExp(`^[0-9a-f]{${SIGNATURE_HEX_LENGTH}}$`, 'i').test(
      clean(actual)
    ) ||
    !new RegExp(`^[0-9a-f]{${SIGNATURE_HEX_LENGTH}}$`, 'i').test(
      clean(expected)
    )
  ) {
    return false;
  }

  const left = Buffer.from(clean(actual).toLowerCase(), 'hex');
  const right = Buffer.from(clean(expected).toLowerCase(), 'hex');

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createStarsInvoicePayload({
  depositId,
  userId,
  amount,
  expiresAt,
}) {
  const depositHex = uuidToHex(depositId);
  const normalizedUserId = safeInteger(userId, 'Telegram user ID');
  const normalizedAmount = safeInteger(amount, 'Stars miqdori');
  const expiresAtMs = new Date(expiresAt || 0).getTime();

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error('Stars invoice muddati noto‘g‘ri.');
  }

  const expiresAtSeconds = Math.floor(expiresAtMs / 1000);
  const core = [
    SIGNED_PREFIX,
    depositHex,
    normalizedUserId.toString(36),
    normalizedAmount.toString(36),
    expiresAtSeconds.toString(36),
  ].join('.');
  const payload = `${core}.${signature(core)}`;

  if (Buffer.byteLength(payload, 'utf8') > 128) {
    throw new Error('Stars invoice payload hajmi Telegram limitidan oshdi.');
  }

  return payload;
}

export function parseStarsInvoicePayload(value = '') {
  const payload = clean(value);
  const legacyMatch = payload.match(LEGACY_PAYLOAD_PATTERN);

  if (legacyMatch) {
    return {
      version: 0,
      signed: false,
      validSignature: true,
      payload,
      depositId: legacyMatch[1].toLowerCase(),
      userId: null,
      amount: null,
      expiresAtSeconds: null,
    };
  }

  const match = payload.match(SIGNED_PAYLOAD_PATTERN);

  if (!match) return null;

  const [, depositHex, userPart, amountPart, expiryPart, actualSignature] =
    match;
  const userId = fromBase36(userPart);
  const amount = fromBase36(amountPart);
  const expiresAtSeconds = fromBase36(expiryPart);
  const depositId = hexToUuid(depositHex);

  if (
    !depositId ||
    userId == null ||
    amount == null ||
    expiresAtSeconds == null
  ) {
    return null;
  }

  const core = [
    SIGNED_PREFIX,
    depositHex.toLowerCase(),
    userPart.toLowerCase(),
    amountPart.toLowerCase(),
    expiryPart.toLowerCase(),
  ].join('.');
  const expectedSignature = signature(core);

  return {
    version: 1,
    signed: true,
    validSignature: signatureMatches(actualSignature, expectedSignature),
    payload,
    depositId,
    userId,
    amount,
    expiresAtSeconds,
  };
}
