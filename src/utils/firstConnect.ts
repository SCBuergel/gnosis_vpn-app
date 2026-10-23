import type {
  BalanceResponse,
  DestinationState,
} from "@src/services/vpnService.ts";
import { isSelectable, type RankContext } from "@src/utils/destinations.ts";

/**
 * A node that has never connected has no payment channels, so the daemon
 * reports every destination as NotRoutable until the first connect opens
 * them. The daemon still accepts that connect; the UI must not dead-end
 * with everything greyed out.
 */
export function needsFirstConnect(
  balance: BalanceResponse | null,
  destinations: Record<string, DestinationState>,
  context: RankContext,
): boolean {
  if (balance === null || balance.channels_out !== 0n) return false;
  const states = Object.values(destinations);
  if (states.length === 0) return false;
  if (states.some((s) => isSelectable(s, context))) return false;
  return states.some(canBeFirstConnect);
}

/** A destination the first connect may target: not routable yet, but not written off either. */
export function canBeFirstConnect(
  state: DestinationState | undefined,
): boolean {
  return state?.route_health?.state.state === "NotRoutable";
}

export const FIRST_CONNECT = {
  headline: "Ready for first connection",
  context:
    "Your first connection sets up payment channels. It takes about a minute.",
} as const;
