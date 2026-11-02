// A committed join is successful even if the subsequent balance read fails.
// Do not turn a missing balance into zero or invite a new payment operation.
export function joinedBalance(result) {
  if (result?.error || result?.data?.balance == null) return null;
  const value = Number(result.data.balance);
  return Number.isFinite(value) ? value : null;
}

export function publicBoard(board) {
  const person = (row) =>
    row
      ? {
          key: String(row.key),
          rank: Number(row.rank),
          name: String(row.name || "Ishtirokchi").slice(0, 60),
          weight: Number(row.weight) || 0,
          stars: Number(row.stars) || 0,
          chance: Math.max(0, Math.min(100, Number(row.chance) || 0)),
          isMe: row.isMe === true,
        }
      : null;
  return {
    rows: (Array.isArray(board.rows) ? board.rows : []).map(person),
    me: person(board.me),
    revision: String(board.revision),
    reset: board.reset === true,
    total: Number(board.total) || 0,
    totalWeight: Number(board.totalWeight) || 0,
    nextOffset: board.nextOffset == null ? null : Number(board.nextOffset),
  };
}
