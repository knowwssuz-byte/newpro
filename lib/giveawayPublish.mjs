export function giveawayNeedsPaidApproval(giveaway) {
  return Number(giveaway?.entry_price || 0) > 0 || giveaway?.mode === 'weighted';
}

// Shared by the admin UI and API to keep the publish button and server checks in sync.
export function giveawayPublishState(giveaway, { paidEnabled = false, now = Date.now() } = {}) {
  if (!giveaway || giveaway.status !== 'draft') return 'not_draft';
  const end = new Date(giveaway.ends_at).getTime();
  if (!Number.isFinite(end) || end <= now) return 'expired';
  if (giveawayNeedsPaidApproval(giveaway) && !paidEnabled) return 'paid_blocked';
  return 'ready';
}
