/**
 * Right after the node starts, the daemon values every path low: the HOPR
 * node has not yet confirmed its relays, so each exit reads as a weak route
 * for about a minute, then the values jump to normal. During that window a
 * low path value is "still exploring", not a verdict on the route.
 */
export const SETTLE_MS = 120_000;

export function isNetworkSettling(
  runningSince: number | null,
  now: number,
): boolean {
  return runningSince !== null && now - runningSince < SETTLE_MS;
}
