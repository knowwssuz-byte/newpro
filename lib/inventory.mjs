/**
 * A case win belongs in the inventory only while the specific won copy is owned.
 * Balance/Stars rewards are credited instantly and never count as gift inventory.
 */
export function isInventoryGift(gift) {
  if (!gift) return false;
  const type = String(gift.type || 'gift').trim().toLowerCase();
  if (['balance', 'stars', 'star', 'currency', 'xp'].includes(type)) return false;
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
      // A withdrawal reserves this exact won copy until resolved.
      // Rejected requests are released back to inventory.
      if (request && ['pending', 'approved'].includes(String(request.status || '').toLowerCase())) return null;
      return {
        item,
        gift,
        caseItem: caseById.get(String(item.case_id)) || null,
        request,
      };
    })
    .filter(Boolean);
}

/**
 * Server-sourced activity timeline; no synthetic progress states.
 * Pending/approved/rejected withdrawals remain listed, even when not owned.
 * Sales are recognized by sold_at, without fabricating withdrawal requests.
 */
export function getGiftActivity(history = [], gifts = [], withdrawals = []) {
  const byGift = new Map(gifts.map(g => [String(g.id), g]));
  const byCopy = new Map(history.map(h => [String(h.id), h]));
  const requests = withdrawals.map(r => {
    const won = byCopy.get(String(r.history_id || '')) || null;
    return {
      id: String(r.id),
      kind: 'withdrawal',
      status: ['approved','rejected'].includes(String(r.status)) ? r.status : 'pending',
      date: r.updated_at || r.created_at || '',
      historyId: r.history_id || '',
      gift: byGift.get(String(r.gift_id || won?.gift_id)) || null,
      note: r.admin_note || '',
    };
  });
  const withdrawalCopies = new Set(withdrawals.map(r => String(r.history_id || '')).filter(Boolean));
  const upgrades = history.filter(h => h.upgraded_at)
    .map(h => ({
      id: String(h.id),
      kind: 'upgrade',
      status: 'upgraded',
      date: h.upgraded_at,
      gift: byGift.get(String(h.gift_id)) || null,
      amount: 0,
      note: '',
    }));
  const sales = history.filter(h => h.sold_at && !h.upgraded_at && !withdrawalCopies.has(String(h.id)))
    .map(h => ({
      id: String(h.id),
      kind: 'sale',
      status: 'sold',
      date: h.sold_at,
      gift: byGift.get(String(h.gift_id)) || null,
      amount: Number(h.sale_price || 0),
      note: '',
    }));
  return [...requests, ...upgrades, ...sales].sort((a,b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
}
