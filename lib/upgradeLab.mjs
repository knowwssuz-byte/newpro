import { isInventoryGift } from './inventory.mjs';

export function giftPrice(gift) {
  for (const value of [gift?.sell_price, gift?.buy_price, gift?.floor_price, gift?.value]) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

export function normalizeUpgradeGift(gift, copyId = null) {
  if (!isInventoryGift(gift)) return null;
  const price = giftPrice(gift);
  if (!price) return null;
  return {
    id: String(copyId || gift.id),
    catalogId: String(gift.id),
    title: String(gift.title || 'Telegram Gift'),
    price,
    rarity: String(gift.rarity || 'standard'),
    imageUrl: String(gift.image_url || gift.png_url || gift.webp_url || ''),
    animationUrl: String(gift.animation_url || ''),
    owned: Boolean(copyId),
  };
}
export function upgradeChance(source, target) {
  if (!source || !target || target.price <= source.price) return 0;
  return Math.min(85, Math.max(5, Math.round(source.price / target.price * 82 * 10) / 10));
}
export function wheelSegments(chance) {
  const probability = Math.min(100, Math.max(0, Number(chance) || 0));
  return Array.from({ length: 10 }, (_, i) => ({
    result: i % 2 === 0 ? 'win' : 'retry',
    weight: (i % 2 === 0 ? probability : 100 - probability) / 5,
  }));
}
export function spinIndex(won, randomValue) {
  const random = Math.max(0, Math.min(.99999999, Number(randomValue) || 0));
  return Math.floor(random * 5) * 2 + (won ? 0 : 1);
}
