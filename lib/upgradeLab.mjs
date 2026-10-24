import { isInventoryGift } from './inventory.mjs';

export function giftPrice(gift) {
  for (const value of [gift?.sell_price, gift?.buy_price, gift?.floor_price]) {
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
  if (!source || !target || !Number.isFinite(source.price) || !Number.isFinite(target.price)
      || source.price <= 0 || target.price <= source.price) return 0;
  // Identical to the database's 82% factor, rounded to 2 decimal places.
  return Math.min(85, Math.round(source.price / target.price * 82 * 100) / 100);
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

// The upgrader is a continuous circular arc, not twelve discrete slots.
// Local zero is the TOP of the ring; angles increase clockwise.
export function normalizeWheelDegrees(degrees) {
  return ((Number(degrees) % 360) + 360) % 360;
}
export function didWheelLandInSafeZone(chance, wheelRotation, pointerDeg=180) {
  const safeArc=Math.max(0,Math.min(100,Number(chance)||0))*3.6;
  if(safeArc<=0)return false;
  if(safeArc>=360)return true;
  const underPointer=normalizeWheelDegrees(pointerDeg-normalizeWheelDegrees(wheelRotation));
  return underPointer<safeArc;
}
export function planUpgradeSpin({chance,previousRotation=0,pointerDeg=180,win,randomValue=0.5}) {
  const safeArc=Math.max(0,Math.min(100,Number(chance)||0))*3.6;
  if(safeArc<=0||safeArc>=360)throw new RangeError('Upgrade chance must be between 0 and 100');
  const r=Math.min(0.999999,Math.max(0,Number(randomValue)||0));
  const margin=Math.min(3.2,safeArc/5,(360-safeArc)/5);
  const targetPoint=win
    ?margin+(safeArc-2*margin)*r
    :safeArc+margin+(360-safeArc-2*margin)*r;
  const current=normalizeWheelDegrees(previousRotation);
  const target=normalizeWheelDegrees(pointerDeg-targetPoint);
  let alignment=normalizeWheelDegrees(target-current);
  if(alignment<.0000001)alignment=360;
  const extraTurns=6+Math.floor(r*2);
  const endRotation=Number(previousRotation)+extraTurns*360+alignment;
  return {endRotation,localLandingAngle:targetPoint,selectedWin:Boolean(win)};
}
