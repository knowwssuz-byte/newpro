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
// One uninterrupted SAFE ZONE: the winner is ONLY segment zero.
// Its angle is exactly the percentage displayed to the player.
// Remaining wedges make up the entire losing arc.
export function wheelSegments(chance) {
  const probability = Math.min(100, Math.max(0, Number(chance) || 0));
  if (!probability) return [{ result: 'retry', weight: 100 }];
  const sectors = [
    { result: 'win', weight: probability, label: 'SAFE ZONE' },
    ...Array.from({ length: 11 }, (_, i) => ({
      result: 'retry', weight: (100 - probability) / 11,
      label: i % 2 ? 'RETRY' : 'TRY AGAIN',
    })),
  ];
  return sectors;
}
export function spinIndex(won, randomValue) {
  if (won) return 0;
  const random = Math.max(0, Math.min(.99999999, Number(randomValue) || 0));
  return 1 + Math.floor(random * 11);
}
export function landedInSafeZone(chance, index) {
  return wheelSegments(chance)[index]?.result === 'win';
}
