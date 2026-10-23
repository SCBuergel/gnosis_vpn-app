import type { WarmupStatus } from "@src/services/vpnService.ts";

/**
 * What the Getting ready screen says under "Starting your node" for each of
 * the daemon's warmup states: plain words for someone who has never heard of
 * an edge client or a runtime.
 */
export function friendlyWarmupStatus(status: WarmupStatus): string {
  switch (status) {
    case "Initializing":
    case "Uninitialized":
    case "InitializingServices":
      return "Starting up";
    case "ValidatingConfig":
    case "ValidatingNetworkConfig":
      return "Checking your settings";
    case "IdentifyingNode":
    case "CheckingOnchainAddress":
    case "AwaitingKeyBinding":
      return "Confirming your node's identity";
    case "ConnectingBlockchain":
      return "Connecting to Gnosis Chain";
    case "CheckingBalance":
      return "Checking your balance";
    case "WaitingForFunds":
      return "Waiting for your funds to arrive";
    case "RegisteringSafe":
      return "Linking your Safe";
    case "AnnouncingNode":
      return "Announcing your node to the network";
    case "CreatingNode":
    case "StartingNode":
      return "Joining the HOPR network";
    case "Ready":
    case "Running":
      return "Almost there";
    case "Degraded":
      return "Running with some trouble, carrying on";
    case "Terminated":
    case "Failed":
      return "Something went wrong, your node is retrying";
  }
}

/** "3 of 8 locations ready": how many exits the node can already reach. */
export function readyLocationsLine(
  progress: { ready: number; total: number },
): string | null {
  if (progress.total === 0) return null;
  return `${progress.ready} of ${progress.total} locations ready`;
}
