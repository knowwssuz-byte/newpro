// Technical publish state only; admin-configured Stars pricing and draw modes
// never require an unrelated feature flag to be announced.
export function giveawayPublishState(giveaway, { now = Date.now() } = {}) {
  if (!giveaway || giveaway.status !== 'draft') return 'not_draft';
  const end = new Date(giveaway.ends_at).getTime();
  if (!Number.isFinite(end) || end <= now) return 'expired';
  return 'ready';
}
