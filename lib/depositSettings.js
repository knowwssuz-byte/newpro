const DEPOSIT_SETTINGS_KEY = 'deposit_settings';

function clean(value = '') {
  return String(value ?? '').trim();
}

function numberInRange(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(max, Math.max(min, number));
}

function integerInRange(value, fallback, min, max) {
  return Math.round(numberInRange(value, fallback, min, max));
}

function booleanValue(value, fallback) {
  if (typeof value === 'boolean') return value;

  const normalized = clean(value).toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return fallback;
}

function telegramUsername(value = '') {
  const normalized = clean(value)
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-zA-Z0-9_]/g, '');

  return normalized.slice(0, 64);
}

function environmentDefaults() {
  const botUsername =
    telegramUsername(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME) ||
    'GiftMystBot';

  return {
    starsEnabled: booleanValue(process.env.DEPOSIT_STARS_ENABLED, true),
    starsMin: integerInRange(process.env.DEPOSIT_STARS_MIN, 10, 1, 1_000_000),
    starsMax: integerInRange(
      process.env.DEPOSIT_STARS_MAX,
      10_000,
      1,
      1_000_000
    ),
    tonEnabled: booleanValue(process.env.DEPOSIT_TON_ENABLED, true),
    tonWallet: clean(process.env.TON_DEPOSIT_WALLET),
    tonStarsRate: numberInRange(
      process.env.TON_STARS_RATE,
      0,
      0,
      100_000_000
    ),
    tonMin: numberInRange(process.env.DEPOSIT_TON_MIN, 0.1, 0.000000001, 1_000_000),
    tonMax: numberInRange(process.env.DEPOSIT_TON_MAX, 100, 0.000000001, 1_000_000),
    tonExpiryMinutes: integerInRange(
      process.env.DEPOSIT_TON_EXPIRY_MINUTES,
      45,
      5,
      240
    ),
    giftEnabled: booleanValue(process.env.DEPOSIT_GIFT_ENABLED, true),
    giftRecipient:
      telegramUsername(process.env.GIFT_DEPOSIT_RECIPIENT) || botUsername,
    giftCreditPercent: integerInRange(
      process.env.GIFT_DEPOSIT_CREDIT_PERCENT,
      85,
      1,
      100
    ),
  };
}

export function normalizeDepositSettings(value = {}, defaults = environmentDefaults()) {
  const input = value && typeof value === 'object' ? value : {};
  const starsMin = integerInRange(input.starsMin, defaults.starsMin, 1, 1_000_000);
  const starsMax = integerInRange(
    input.starsMax,
    defaults.starsMax,
    starsMin,
    1_000_000
  );
  const tonMin = numberInRange(
    input.tonMin,
    defaults.tonMin,
    0.000000001,
    1_000_000
  );
  const tonMax = numberInRange(
    input.tonMax,
    defaults.tonMax,
    tonMin,
    1_000_000
  );

  return {
    starsEnabled: booleanValue(input.starsEnabled, defaults.starsEnabled),
    starsMin,
    starsMax,
    tonEnabled: booleanValue(input.tonEnabled, defaults.tonEnabled),
    tonWallet: clean(input.tonWallet || defaults.tonWallet),
    tonStarsRate: numberInRange(
      input.tonStarsRate,
      defaults.tonStarsRate,
      0,
      100_000_000
    ),
    tonMin,
    tonMax,
    tonExpiryMinutes: integerInRange(
      input.tonExpiryMinutes,
      defaults.tonExpiryMinutes,
      5,
      240
    ),
    giftEnabled: booleanValue(input.giftEnabled, defaults.giftEnabled),
    giftRecipient:
      telegramUsername(input.giftRecipient) || defaults.giftRecipient,
    giftCreditPercent: integerInRange(
      input.giftCreditPercent,
      defaults.giftCreditPercent,
      1,
      100
    ),
  };
}

export function depositSettingsForClient(settings = {}) {
  const normalized = normalizeDepositSettings(settings);

  return {
    ...normalized,
    starsConfigured: normalized.starsEnabled,
    tonConfigured:
      normalized.tonEnabled &&
      Boolean(normalized.tonWallet) &&
      normalized.tonStarsRate > 0,
    giftConfigured:
      normalized.giftEnabled && Boolean(normalized.giftRecipient),
  };
}

export async function getDepositSettings(supabase) {
  const defaults = environmentDefaults();
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', DEPOSIT_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();

    if (!text.includes('app_settings') && error.code !== '42P01') {
      throw error;
    }
  }

  return normalizeDepositSettings(data?.value || {}, defaults);
}

export function settingsRow(settings = {}) {
  return {
    key: DEPOSIT_SETTINGS_KEY,
    value: normalizeDepositSettings(settings),
  };
}

export { DEPOSIT_SETTINGS_KEY };
