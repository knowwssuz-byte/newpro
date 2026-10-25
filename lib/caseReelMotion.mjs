// Presentation-only helpers. Reward selection is exclusively server-authoritative.
export const REEL_PRE_WIN = 37;
export const REEL_POST_WIN = 7;
export const CASE_CINEMATIC_ACTIVATION_MS = 620;
export const CASE_ROLL_DURATION_MS = 4650;

// The winning gift is injected by the server result, always at this known slot.
export function winningIndexOfReel(reel) {
  return Math.max(0, (reel?.length || 0) - REEL_POST_WIN - 1);
}

export function reelLandingDistance({ cardLeft, cardWidth, viewportWidth }) {
  for(const value of [cardLeft, cardWidth, viewportWidth]) {
    if (!Number.isFinite(value)) return 0;
  }
  // Card center must coincide with the viewport's 50% pointer.
  return Math.max(0, cardLeft + cardWidth / 2 - viewportWidth / 2);
}

export function cinematicReelKeyframes(startDistance, endDistance) {
  const start = Math.max(0, Number(startDistance) || 0);
  const end = Math.max(start, Number(endDistance) || start);
  const length = end - start;
  const at = (fraction) => `translate3d(${-(start + length * fraction)}px,0,0)`;
  return [
    { offset: 0, transform: at(0), easing: 'cubic-bezier(.55,.08,.85,.42)' },
    { offset: .16, transform: at(.06), easing: 'linear' },
    { offset: .65, transform: at(.77), easing: 'cubic-bezier(.22,.44,.23,.94)' },
    { offset: .90, transform: at(.973), easing: 'cubic-bezier(.18,.38,.25,1)' },
    { offset: 1, transform: at(1) },
  ];
}
