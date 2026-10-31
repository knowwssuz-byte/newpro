// Shared daily Free Case deadline math. The database remains the authority.
export const FREE_CASE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function nextFreeCaseAt(openedAt) {
  const openedMs = Date.parse(openedAt || '');
  return Number.isFinite(openedMs)
    ? new Date(openedMs + FREE_CASE_COOLDOWN_MS).toISOString()
    : null;
}

export function freeCaseSecondsLeft(deadline, nowMs = Date.now()) {
  const deadlineMs = Date.parse(deadline || '');
  if (!Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function formatFreeCaseCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':');
}
