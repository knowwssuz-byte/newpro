// Shared, deterministic payout calculation. Never promise a win greater than
// the amount backed by the configured probabilities and house edge.
export function getDiceMultiplier(chance, houseEdgePercent) {
  const p = Number(chance);
  const edge = Number(houseEdgePercent);
  if (!Number.isFinite(p) || p <= 0 || p >= 100 ||
      !Number.isFinite(edge) || edge < 0 || edge >= 100) {
    throw new RangeError('Invalid dice probability or house edge');
  }
  return Math.floor(((100 - edge) / p) * 100) / 100;
}

export function getDicePayout(bet, chance, houseEdgePercent, won) {
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('Invalid dice bet');
  const multiplier = getDiceMultiplier(chance, houseEdgePercent);
  // Floors prevent fractional balances; in particular no bet+1 guarantee.
  return won ? Math.floor(bet * multiplier) : 0;
}
