// Telegram Bot API Gift classification. Never infer unlimited supply from a
// database default of 0: the *absence* of the optional API fields is decisive.
const has = (value, field) => Object.prototype.hasOwnProperty.call(value, field);

export function isUnlimitedNonUpgradableGift(gift) {
  if (!gift || typeof gift !== 'object') return false;
  if (!/^\d{5,25}$/.test(String(gift.id || ''))) return false;
  const price = Number(gift.star_count);
  if (!Number.isSafeInteger(price) || price <= 0) return false;
  // Any limited availability or collectible-upgrade hint excludes the gift.
  return !has(gift, 'total_count') &&
    !has(gift, 'remaining_count') &&
    !has(gift, 'personal_total_count') &&
    !has(gift, 'personal_remaining_count') &&
    !has(gift, 'upgrade_star_count') &&
    !has(gift, 'unique_gift_variant_count') &&
    gift.has_colors !== true;
}

export function isVerifiedUnlimitedCatalogGift(item) {
  const raw = item?.raw;
  return Boolean(
    raw && raw.source === 'bot_api_getAvailableGifts' &&
    raw.giftKind === 'unlimited_non_upgradable' &&
    raw.limited === false && raw.upgradeable === false &&
    /^\d{5,25}$/.test(String(item.telegram_gift_id || '')) &&
    Number(item.star_count) > 0
  );
}
