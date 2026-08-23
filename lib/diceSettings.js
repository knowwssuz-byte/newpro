const DICE_SETTINGS_KEY = 'dice_settings';

export const DEFAULT_DICE_SETTINGS = Object.freeze({
  enabled: true,
  minBet: 1,
  maxBet: 10000,
  minWinChance: 5,
  maxWinChance: 85,
  houseEdgePercent: 3,
  rollDurationMs: 1400,
});

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback) {
  return Math.round(number(value, fallback));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDiceSettings(value = {}) {
  const minBet = clamp(integer(value.minBet, DEFAULT_DICE_SETTINGS.minBet), 1, 100000);
  const maxBet = clamp(
    integer(value.maxBet, DEFAULT_DICE_SETTINGS.maxBet),
    minBet,
    1000000
  );
  const minWinChance = clamp(
    integer(value.minWinChance, DEFAULT_DICE_SETTINGS.minWinChance),
    2,
    30
  );
  const maxWinChance = clamp(
    integer(value.maxWinChance, DEFAULT_DICE_SETTINGS.maxWinChance),
    Math.max(50, minWinChance + 5),
    90
  );

  return {
    enabled: value.enabled !== false,
    minBet,
    maxBet,
    minWinChance,
    maxWinChance,
    houseEdgePercent: clamp(
      number(value.houseEdgePercent, DEFAULT_DICE_SETTINGS.houseEdgePercent),
      0.5,
      10
    ),
    rollDurationMs: clamp(
      integer(value.rollDurationMs, DEFAULT_DICE_SETTINGS.rollDurationMs),
      800,
      2400
    ),
  };
}

export function diceSettingsForClient(value = {}) {
  return normalizeDiceSettings(value);
}

export async function getDiceSettings(supabase) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', DICE_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (!text.includes('app_settings') && error.code !== '42P01') throw error;
    return normalizeDiceSettings();
  }

  return normalizeDiceSettings(data?.value || {});
}

export function diceSettingsRow(value = {}) {
  return {
    key: DICE_SETTINGS_KEY,
    value: normalizeDiceSettings(value),
  };
}
