'use client';

import { useEffect, useState } from 'react';
import { freeCaseSecondsLeft } from '@/lib/freeCaseCooldown.mjs';

// Only active Free Case buttons tick. Recompute from a deadline, not a
// decrementing counter, so background tabs and slow devices stay accurate.
export default function useFreeCaseCountdown(deadline, clockOffsetMs = 0) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return undefined;
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(() => {
      update();
      if (freeCaseSecondsLeft(deadline, Date.now() + clockOffsetMs) === 0) {
        window.clearInterval(interval);
      }
    }, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline, clockOffsetMs]);

  return freeCaseSecondsLeft(deadline, now + clockOffsetMs);
}
