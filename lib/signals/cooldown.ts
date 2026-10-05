/** External (web-search) refreshes cost provider credits, so each account has a cooldown between runs. */
export const REFRESH_COOLDOWN_MS = 10 * 60_000;

export function refreshCooldownRemainingMs(externalRefreshAt: string | undefined | null, now = Date.now()): number {
  if (!externalRefreshAt) return 0;
  const last = Date.parse(externalRefreshAt);
  if (Number.isNaN(last)) return 0;
  return Math.max(0, last + REFRESH_COOLDOWN_MS - now);
}
