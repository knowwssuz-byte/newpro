// Pure, testable local PvP rules. No stake or server-side balance operations.
export const TIC_TAC_TOE_LINES = Object.freeze([
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]);

export function evaluateBoard(board) {
  if (!Array.isArray(board) || board.length !== 9) return null;
  for (const [a, b, c] of TIC_TAC_TOE_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  return board.every(Boolean) ? { winner: 'draw', line: [] } : null;
}

// Returns 0 if player 1 wins, 1 if player 2 wins, -1 for tie.
export function resolveRps(first, second) {
  const moves = ['rock', 'paper', 'scissors'];
  if (!moves.includes(first) || !moves.includes(second)) return null;
  if (first === second) return -1;
  return (first === 'rock' && second === 'scissors') ||
    (first === 'paper' && second === 'rock') ||
    (first === 'scissors' && second === 'paper') ? 0 : 1;
}
