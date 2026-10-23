import type { AppState } from "@src/stores/appStore.ts";
import { effectiveActive } from "@src/stores/destinationMode.ts";
import {
  isSelectable,
  isVpnActive,
  rankContext,
} from "@src/utils/destinations.ts";
import { logError } from "@src/utils/appLog.ts";
import {
  canBeFirstConnect,
  needsFirstConnect,
} from "@src/utils/firstConnect.ts";

type PrimaryActions = {
  connect: (targetId: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

/** Whether the main action (connect, cancel or disconnect) can run right now. */
export function primaryActionEnabled(appState: AppState): boolean {
  if (appState.isLoading) return false;
  if (isVpnActive(appState.vpnStatus, appState.targetDestination)) return true;
  const id = effectiveActive(appState.mode, Date.now());
  const target = id ? appState.destinations[id] : undefined;
  const context = rankContext(appState);
  // Selectable, not ready: a weak route the user picked deliberately must still connect.
  if (isSelectable(target, context)) return true;
  // A node without channels connects to open them; nothing is routable before that.
  return needsFirstConnect(appState.balance, appState.destinations, context) &&
    canBeFirstConnect(target);
}

/** The Connect button's action, shared with the Enter shortcut. */
export async function runPrimaryAction(
  appState: AppState,
  actions: PrimaryActions,
): Promise<void> {
  try {
    if (isVpnActive(appState.vpnStatus, appState.targetDestination)) {
      await actions.disconnect();
    } else {
      // Resolved fresh at call time: a memo recomputes on `mode`, not on the clock crossing settleAt.
      const id = effectiveActive(appState.mode, Date.now());
      if (id) await actions.connect(id);
    }
  } catch (error) {
    // safety net — store actions handle their own errors
    const message = error instanceof Error ? error.message : String(error);
    logError(`Primary action failed: ${message}`);
  }
}
