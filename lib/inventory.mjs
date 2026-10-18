/**
 * A case win belongs in the inventory only while the specific won copy is owned.
 * Balance/Stars rewards are credited instantly and never count as gift inventory.
 */
export function isInventoryGift(gift) {
  if (!gift) return false;
  const type = String(gift.type || 'gift').trim().toLowerCase();
  if (['balance', 'stars', 'star', 'currency'].includes(type)) return false;
  const title = String(gift.title || '').trim();
  if (/^(?:(?:\+?\d+(?:[.,]\d+)?)\s*)?(?:telegram\s+)?stars?(?:\s+\+?\d+(?:[.,]\d+)?)?$/i.test(title)) return false;
  if (/^\+?\d+(?:[.,]\d+)?\s*⭐$/.test(title)) return false;
  return true;
}

/** Resolve withdrawals against the unique won copy, not just the catalog gift. */
export function getInventoryRows(history = [], gifts = [], cases = [], withdrawals = []) {
  const giftById = new Map(gifts.map((gift) => [String(gift.id), gift]));
  const caseById = new Map(cases.map((item) => [String(item.id), item]));
  const withdrawalsByHistory = new Map();
  const legacyByGift = new Map();
  const copyCounts = new Map();

  for (const item of history) {
    const id = String(item.gift_id);
    copyCounts.set(id, (copyCounts.get(id) || 0) + 1);
  }
  for (const request of withdrawals) {
    if (request.history_id) {
      withdrawalsByHistory.set(String(request.history_id), request);
    } else if (request.gift_id) {
      legacyByGift.set(String(request.gift_id), request);
    }
  }

  return history
    .filter((item) => !item.sold_at)
    .map((item) => {
      const gift = giftById.get(String(item.gift_id));
      if (!isInventoryGift(gift)) return null;
      const request = withdrawalsByHistory.get(String(item.id))
        || (copyCounts.get(String(item.gift_id)) === 1 ? legacyByGift.get(String(item.gift_id)) : null)
        || null;
      return {
        item,
        gift,
        caseItem: caseById.get(String(item.case_id)) || null,
        request,
      };
    })
    .filter(Boolean);
}
