import { batch, createEffect, createRoot, on } from "solid-js";
import { createStore, reconcile, type Store } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  resolveChannelResync,
  resolveEndOfLife,
  resolveUpdateDecision,
} from "@src/utils/updateAvailability.ts";
import {
  getToolkitInfo,
  TOOLKIT_MISSING,
  TOOLKIT_TOO_OLD,
} from "@src/services/toolkit.ts";

import {
  type BalanceResponse,
  BalanceResponseSchema,
  type ConnectedInfo,
  type ConnectingInfo,
  type Destination,
  type DestinationState,
  type DisconnectingInfo,
  isDeployingSafeRunMode,
  isPreparingSafeRunMode,
  isRunningRunMode,
  isWarmupRunMode,
  type ProbeView,
  type ReconnectingInfo,
  type RunMode,
  type ServiceInfo,
  ServiceInfoSchema,
  type StatusResponse,
  StatusResponseSchema,
  VPNService,
} from "@src/services/vpnService.ts";
import {
  createDestinationMode,
  type DestinationMode,
  type DestinationModeHandle,
  effectiveActive,
  type ModeAppState,
} from "@src/stores/destinationMode.ts";
import {
  FIRST_PASS_ATTEMPTS,
  IDLE_SCHEDULE,
  nextQuickProbe,
  quickProbeAnswered,
  timedOutProbe,
  wantsFirstPass,
} from "@src/stores/quickProbeScheduler.ts";
import {
  logError,
  logInfo,
  logMessage as log,
  logStatus,
  logWarn,
} from "@src/utils/appLog.ts";
import {
  destinationLabel,
  getPreferredAvailabilityChangeMessage,
  pickStartupTarget,
  rankContext,
} from "@src/utils/destinations.ts";

import { type EndOfLife, useSettingsStore } from "@src/stores/settingsStore.ts";
import { deriveVPNStatus } from "@src/utils/status.ts";
import { shortAddress } from "../utils/shortAddress.ts";
import {
  AppScreen,
  createScreenSelector,
  detectSyncPhase,
  type RouteSearchProgress,
  routeSearchProgress,
  type SyncPhaseIndex,
} from "@src/stores/screenSelector.ts";

export { AppScreen };

/** Whether the toolkit could be used. `unknown` is "not probed yet" and nothing
 * else: a probe that ran and failed is `failed`, which the Updates tab explains. */
export type ToolkitStatus = "unknown" | "ok" | "missing" | "tooOld" | "failed";

export interface ToolkitState {
  status: ToolkitStatus;
  /** The updater's own version, when it answered. */
  version: string | null;
  /** The installed package as the updater read it from the version file. */
  packageVersion: string | null;
}

export interface AppState {
  currentScreen: AppScreen;
  serviceInfo: ServiceInfo | null;
  availableDestinations: Destination[];
  destinations: Record<string, DestinationState>;
  connected: ConnectedInfo | null;
  connecting: ConnectingInfo | null;
  reconnecting: ReconnectingInfo | null;
  disconnecting: DisconnectingInfo[];
  // The daemon's one probe session, which follows the active destination.
  probe: ProbeView | null;
  isLoading: boolean;
  error?: string;
  runMode: RunMode | null;
  vpnStatus: string;
  warmupStatus: string;
  // Which startup step the daemon is in while the startup screen shows.
  syncPhase: SyncPhaseIndex | null;
  /** The Safe was set up during this app run, so the startup list shows that step. */
  firstRun: boolean;
  /** How far the daemon's route search has come while the startup screen waits on it. */
  syncRoutes: RouteSearchProgress | null;
  /** When this app run saw the node reach Running; null if it was already running at launch. */
  runningSince: number | null;
  /** The first pass of quick probes is still running: "best" is provisional. */
  measuring: boolean;
  syncRecoveryReason: string | null;
  isUpdateAvailable: boolean;
  availableVersion: string | null;
  // Set only while the stored verdict covers the installed package.
  endOfLife: EndOfLife | null;
  targetDestination: string | null;
  balance: BalanceResponse | null;
  // The installed package version everything update-facing keys off: the toolkit's
  // read of the version file, falling back to the daemon's for older installs.
  packageVersion: string | null;
  toolkit: ToolkitState;
  // The carousel's cards and active pointer — see docs/destinationMode.md
  mode: DestinationMode;
}

type AppActions = {
  initializeApp: () => Promise<void>;
  setScreen: (screen: AppScreen) => void;
  connect: (targetId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  slideCommitted: (id: string) => void;
  dragStarted: () => void;
  destinationListOpened: () => void;
  destinationListClosed: (picked: string | null) => void;
  refreshToolkit: () => Promise<void>;
};

type AppStoreTuple = readonly [Store<AppState>, AppActions];

type StatusEvent = {
  payload: { Ok: StatusResponse | null } | { Err: string };
  id: number;
  event: string;
};

type BalanceEvent = {
  payload: { Ok: BalanceResponse | null } | { Err: string };
  id: number;
  event: string;
};

function initialState(): AppState {
  return {
    availableDestinations: [],
    connected: null,
    connecting: null,
    reconnecting: null,
    currentScreen: AppScreen.Initialization,
    destinations: {},
    disconnecting: [],
    probe: null,
    error: undefined,
    isLoading: false,
    runMode: null,
    serviceInfo: null,
    vpnStatus: "ServiceUnavailable",
    warmupStatus: "",
    syncPhase: null,
    firstRun: false,
    syncRoutes: null,
    runningSince: null,
    measuring: false,
    syncRecoveryReason: null,
    isUpdateAvailable: false,
    availableVersion: null,
    endOfLife: null,
    targetDestination: null,
    balance: null,
    packageVersion: null,
    toolkit: { status: "unknown", version: null, packageVersion: null },
    mode: {
      entries: {},
      sequence: [],
      active: null,
      mode: { mode: "auto", pending: null },
      nextKey: 0,
      listOpen: false,
      dragging: false,
      preferredLocation: null,
      lastConnectedDestination: null,
      connectOnStartup: false,
    },
  };
}

export function createAppStore(): AppStoreTuple {
  const [state, setState] = createStore<AppState>(initialState());

  let unlistenServiceInfo: (() => void) | undefined;
  let unlistenStatusUpdate: (() => void) | undefined;
  let unlistenBalanceUpdate: (() => void) | undefined;
  const selectScreen = createScreenSelector();

  const [settings, settingsActions] = useSettingsStore();

  // destinationMode.ts snapshots settings once at creation, so wait for real hydrated values.
  let destinationMode: DestinationModeHandle | undefined;
  // A status can arrive before hydration; replay it once the handle exists.
  // Exits the first pass stops waiting for: refused by the daemon, or probed twice without a result.
  // Without this a refusal would be re-asked every poll and `measuring` would hold auto's countdown forever.
  const firstPassRefused = new Set<string>();
  const firstPassTimeouts = new Map<string, number>();
  let quickProbes = IDLE_SCHEDULE;
  let pendingModeAppState: ModeAppState | undefined;

  // Creates once, then only mirrors — must never call applyStatusUpdate here, or this effect (which reads destinationMode.model) retriggers itself forever.
  createEffect(() => {
    if (!destinationMode) {
      if (!settingsActions.hydrated()) return;
      destinationMode = createDestinationMode({
        preferredLocation: settings.preferredLocation,
        lastConnectedDestination: settings.lastConnectedDestination,
        connectOnStartup: settings.connectOnStartup,
      });
      if (pendingModeAppState) {
        destinationMode.applyStatusUpdate(pendingModeAppState);
      }
    }
    batch(() =>
      setState("mode", reconcile({ ...destinationMode!.model }, { key: "key" }))
    );
  });

  // The fast status poll is the list's: it follows `listOpen` whoever changes it,
  // the user closing it, a connection we did not issue, or a reset after an error.
  createEffect(on(() => state.mode.listOpen, (open, previous) => {
    if (previous === undefined || open === previous) return;
    VPNService.setStatusPollFast(open).catch((error) => logWarn(`${error}`));
    if (!open) quickProbes = IDLE_SCHEDULE;
  }));

  const criticalError = (message: string) => {
    // status errors repeat every poll tick; log only when the message changes
    if (state.error !== message) logError(message);
    // A daemon that comes back starts the first pass afresh.
    firstPassRefused.clear();
    firstPassTimeouts.clear();
    const savedServiceInfo = state.serviceInfo;
    // The toolkit probe does not go through the daemon (it reads the version
    // file itself), so a daemon error says nothing about its result: keep it.
    const savedToolkit = { ...state.toolkit };
    const savedPackageVersion = state.packageVersion;
    setState(reconcile(initialState()));
    setState("serviceInfo", savedServiceInfo);
    setState("toolkit", savedToolkit);
    setState("packageVersion", savedPackageVersion);
    setState("error", message);
    destinationMode?.reset({
      preferredLocation: settings.preferredLocation,
      lastConnectedDestination: settings.lastConnectedDestination,
      connectOnStartup: settings.connectOnStartup,
    });
  };

  const processStatusResponse = (response: StatusResponse) => {
    const freshNode = state.balance !== null &&
      state.balance.channels_out === 0n;
    const [screen, warmupStatus, recoveryReason] = selectScreen(
      response,
      freshNode,
    );
    setState("syncPhase", detectSyncPhase(response));
    setState("syncRoutes", routeSearchProgress(response));
    // Onboarding and the deployment both mean the Safe is new to this run.
    if (
      isPreparingSafeRunMode(response.run_mode) ||
      isDeployingSafeRunMode(response.run_mode)
    ) {
      setState("firstRun", true);
    }
    if (isWarmupRunMode(response.run_mode)) {
      const lastError = response.run_mode.Warmup.last_error;
      // The daemon retries warmup; only outside the sync screen is that fatal.
      if (lastError && screen !== AppScreen.Synchronization) {
        criticalError(lastError);
        return;
      }
    }
    if (recoveryReason && state.syncRecoveryReason !== recoveryReason) {
      logError(recoveryReason);
    }
    setState("syncRecoveryReason", recoveryReason);
    const destinations = Object.fromEntries(
      response.destinations.map((ds) => [ds.destination.id, ds]),
    );
    const availableDestinations = response.destinations.map(
      (ds) => ds.destination,
    );
    logStateChange(response, destinations);
    logPrefMsg(availableDestinations);
    logStatus(response);
    setState("error", undefined);
    setState("currentScreen", screen);
    setState("warmupStatus", warmupStatus);
    // Seen starting in this run: a low path value is the network settling, not a weak route.
    if (
      isRunningRunMode(response.run_mode) && state.runMode !== null &&
      !isRunningRunMode(state.runMode)
    ) {
      setState("runningSince", Date.now());
    }
    setState("runMode", reconcile(response.run_mode));
    setState("destinations", reconcile(destinations));
    setState("targetDestination", response.target_destination);
    setState("connected", response.connected);
    setState("connecting", reconcile(response.connecting));
    setState("reconnecting", reconcile(response.reconnecting));
    setState("disconnecting", reconcile(response.disconnecting));
    setState("probe", reconcile(response.probe));
    setState("vpnStatus", deriveVPNStatus(response));
    setState("availableDestinations", availableDestinations);

    const modeStatus = {
      availableDestinations,
      destinations,
      connected: response.connected,
      connecting: response.connecting,
      reconnecting: response.reconnecting,
      probe: response.probe,
    };
    const measuringFor = (): boolean =>
      destinationMode !== undefined &&
      !destinationMode.model.listOpen &&
      wantsFirstPass(
        modeStatus,
        effectiveActive(destinationMode.model, Date.now()),
        firstPassRefused,
      );
    // The model's hold input is judged against the active it has now; the
    // active it picks from this update decides what the hero says.
    pendingModeAppState = { ...modeStatus, measuring: measuringFor() };
    destinationMode?.applyStatusUpdate(pendingModeAppState);
    const measuring = measuringFor();
    pendingModeAppState.measuring = measuring;
    setState("measuring", measuring);
    maybeConnectOnStartup(pendingModeAppState);
    reconcileProbe(pendingModeAppState);
    runQuickProbes(pendingModeAppState);
  };

  // Retry cadence when the daemon could not open the probe yet, e.g. its edge client is still starting.
  const PROBE_RETRY_MS = 5_000;
  let lastProbe: { id: string; at: number } | null = null;

  /** The probe follows the active destination; while live the connection already holds it. */
  const ensureProbe = (id: string, now: number) => {
    const sameRecently = lastProbe?.id === id &&
      now - lastProbe.at < PROBE_RETRY_MS;
    if (sameRecently) return;
    lastProbe = { id, at: now };
    VPNService.probe(id)
      .then((response) => logInfo(`Probe ${id}: ${response.type}`))
      .catch((error) => logWarn(`Probe ${id} failed: ${error}`));
  };

  const probeTarget = (): string | null => {
    const mode = destinationMode?.model;
    if (!mode || mode.mode.mode === "live") return null;
    return effectiveActive(mode, Date.now());
  };

  createEffect(() => {
    // Tracks the mirrored mode so a slide, a pick or an auto commit re-points the probe.
    effectiveActive(state.mode, Date.now());
    const id = probeTarget();
    if (id !== null) ensureProbe(id, Date.now());
  });

  /** A status whose probe is elsewhere means the daemon lost or refused ours: ask again. */
  const reconcileProbe = (status: ModeAppState) => {
    const id = probeTarget();
    if (id === null || status.probe?.destination_id === id) return;
    ensureProbe(id, Date.now());
  };

  /** One quick probe at a time while the list is open, or once over the never-measured exits while idle; see docs/destinationMode.md, Probing. */
  const runQuickProbes = (status: ModeAppState) => {
    if (!destinationMode) return;
    const listOpen = destinationMode.model.listOpen;
    const now = Date.now();
    const activeId = effectiveActive(destinationMode.model, now);
    const firstPass = !listOpen &&
      wantsFirstPass(status, activeId, firstPassRefused);
    if (!listOpen && !firstPass) return;
    const lost = timedOutProbe(quickProbes, now);
    if (lost !== null) giveUpEventually(lost);
    const next = nextQuickProbe(quickProbes, status, activeId, now, {
      unmeasuredOnly: firstPass,
      exclude: firstPass ? firstPassRefused : undefined,
    });
    quickProbes = next.schedule;
    if (next.issue === null) return;
    const id = next.issue;
    VPNService.quickProbe(id)
      .then((response) => {
        const accepted = response.type === "Checking";
        quickProbes = quickProbeAnswered(quickProbes, id, accepted);
        if (accepted) return;
        logInfo(`Quick probe ${id}: ${response.type}`);
        if (!firstPass) return;
        // A refusal is final for the session; "not now" (NotReady, Already*) is retried, within bounds.
        if (
          response.type === "UnableToProbe" ||
          response.type === "DestinationNotFound"
        ) {
          firstPassRefused.add(id);
        } else {
          giveUpEventually(id);
        }
      })
      .catch((error) => {
        quickProbes = quickProbeAnswered(quickProbes, id, false);
        if (firstPass) giveUpEventually(id);
        logWarn(`Quick probe ${id} failed: ${error}`);
      });
  };

  /** A lost or deferred probe counts as an attempt; after FIRST_PASS_ATTEMPTS the pass stops asking. */
  const giveUpEventually = (id: string) => {
    const attempts = (firstPassTimeouts.get(id) ?? 0) + 1;
    firstPassTimeouts.set(id, attempts);
    if (attempts >= FIRST_PASS_ATTEMPTS) firstPassRefused.add(id);
  };

  // One shot per launch, like preferredLocation: spent once a session is live or something is ready to connect.
  let startupConnectDone = false;
  const maybeConnectOnStartup = (status: ModeAppState) => {
    if (startupConnectDone || !settingsActions.hydrated()) return;
    if (!settings.connectOnStartup) {
      startupConnectDone = true;
      return;
    }
    const sessionLive = status.connected !== null ||
      status.connecting !== null || status.reconnecting !== null;
    if (sessionLive) {
      startupConnectDone = true;
      return;
    }
    const target = pickStartupTarget(
      status.destinations,
      settings.preferredLocation,
      settings.lastConnectedDestination,
      rankContext(status),
    );
    if (target === null) return;
    startupConnectDone = true;
    log("Connect on startup");
    void actions.connect(target);
  };

  const logStateChange = (
    response: StatusResponse,
    destinations: Record<string, DestinationState>,
  ) => {
    const nextConnecting = response.connecting;
    const connectingIdChanged =
      state.connecting?.destination_id !== nextConnecting?.destination_id;
    const connectingPhaseChanged =
      state.connecting?.phase !== nextConnecting?.phase;
    if (nextConnecting && (connectingIdChanged || connectingPhaseChanged)) {
      const dest = destinations[nextConnecting.destination_id]?.destination;
      const label = dest
        ? destinationLabel(dest)
        : nextConnecting.destination_id;
      const short = dest ? shortAddress(dest.address) : "";
      const display = short ? `${label} - ${short}` : label;
      log(`Connecting: ${display} - ${nextConnecting.phase}`);
    }

    const nextReconnecting = response.reconnecting;
    const reconnectingIdChanged =
      state.reconnecting?.destination_id !== nextReconnecting?.destination_id;
    const reconnectingPhaseChanged =
      state.reconnecting?.phase !== nextReconnecting?.phase;
    // Phase-less reconnects (waiting on route health) are logged by appLog's logStatus.
    if (
      nextReconnecting?.phase &&
      (reconnectingIdChanged || reconnectingPhaseChanged)
    ) {
      const dest = destinations[nextReconnecting.destination_id]?.destination;
      const label = dest
        ? destinationLabel(dest)
        : nextReconnecting.destination_id;
      const short = dest ? shortAddress(dest.address) : "";
      const display = short ? `${label} - ${short}` : label;
      log(`Reconnecting: ${display} - ${nextReconnecting.phase}`);
    }

    const connectedId = response.connected?.destination_id;
    if (connectedId && connectedId !== state.connected?.destination_id) {
      const dest = destinations[connectedId]?.destination;
      const label = dest ? destinationLabel(dest) : connectedId;
      const short = dest ? shortAddress(dest.address) : "";
      const display = short ? `${label} - ${short}` : label;
      log(`Connected: ${display}`);
    }

    const prevDisconnectingMap = new Map(
      state.disconnecting.map((d) => [d.destination_id, d.phase]),
    );
    for (const d of response.disconnecting) {
      const prevPhase = prevDisconnectingMap.get(d.destination_id);
      if (prevPhase === undefined || prevPhase !== d.phase) {
        const dest = destinations[d.destination_id]?.destination;
        const label = dest ? destinationLabel(dest) : d.destination_id;
        const short = dest ? shortAddress(dest.address) : "";
        const display = short ? `${label} - ${short}` : label;
        log(`Disconnecting: ${display} - ${d.phase}`);
      }
    }
  };

  const logPrefMsg = (availableDestinations: Destination[]) => {
    const prefMsg = getPreferredAvailabilityChangeMessage(
      state.availableDestinations,
      availableDestinations,
      settings.preferredLocation,
    );
    if (prefMsg) log(prefMsg);
  };

  // Asks the toolkit for its version and the package's. Failing is a state the
  // Updates tab explains, never an error screen. One probe at a time.
  let toolkitProbe: Promise<void> | undefined;
  const refreshToolkit = (): Promise<void> => {
    if (toolkitProbe) return toolkitProbe;
    toolkitProbe = (async () => {
      try {
        const info = await getToolkitInfo();
        setState("toolkit", {
          status: "ok",
          version: info.version,
          packageVersion: info.package_version,
        });
      } catch (e) {
        const status: ToolkitStatus = e === TOOLKIT_MISSING
          ? "missing"
          : e === TOOLKIT_TOO_OLD
          ? "tooOld"
          : "failed";
        if (status === "failed") logWarn(`Toolkit probe failed: ${e}`);
        setState("toolkit", { status, version: null, packageVersion: null });
      } finally {
        toolkitProbe = undefined;
      }
    })();
    return toolkitProbe;
  };

  const actions = {
    initializeApp: async () => {
      // Independent of the daemon: the toolkit reads the version file itself,
      // so the package version is known even when the daemon is down.
      void refreshToolkit();
      if (unlistenServiceInfo) {
        unlistenServiceInfo();
        unlistenServiceInfo = undefined;
      }
      if (unlistenStatusUpdate) {
        unlistenStatusUpdate();
        unlistenStatusUpdate = undefined;
      }
      if (unlistenBalanceUpdate) {
        unlistenBalanceUpdate();
        unlistenBalanceUpdate = undefined;
      }

      try {
        unlistenServiceInfo = await listen<unknown>("service_info", (event) => {
          const parsed = ServiceInfoSchema.safeParse(
            (event as { payload: unknown }).payload,
          );
          if (parsed.success) {
            setState("serviceInfo", parsed.data);
          } else {
            const issues = parsed.error.issues
              .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
              .join("; ");
            criticalError(`Invalid service_info event: ${issues}`);
          }
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        criticalError("Failed to listen for service_info updates: " + errorMsg);
      }

      const listenCb = (event: unknown) => {
        let statusResp: StatusResponse | void;
        try {
          statusResp = incomingStatusEvent(event as StatusEvent);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          criticalError("Error processing status update: " + errorMsg);
          return;
        }

        if (!statusResp) {
          criticalError("Received empty status response");
          return;
        }

        processStatusResponse(statusResp);
      };

      try {
        unlistenStatusUpdate = await listen<Promise<StatusResponse | null>>(
          "status",
          listenCb,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        criticalError("Failed to listen for status updates: " + errorMsg);
        return;
      }

      const balanceListenCb = (event: unknown) => {
        const balEvent = event as BalanceEvent;
        if ("Ok" in balEvent.payload) {
          const parsed = balEvent.payload.Ok === null
            ? null
            : BalanceResponseSchema.safeParse(balEvent.payload.Ok);
          if (parsed === null) {
            // Transient daemon hiccup (Balance(Err) / WorkerOffline tick):
            // keep the last-known balance instead of dropping the UI back to
            // the issue-only fallback. criticalError still resets everything.
          } else if (parsed && parsed.success) {
            setState("balance", parsed.data);
          } else if (parsed) {
            const issues = parsed.error.issues
              .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
              .join("; ");
            criticalError(`Invalid balance response: ${issues}`);
          }
        } else {
          // backend already persists balance failures; devtools only
          console.error("Balance polling error", balEvent.payload.Err);
        }
      };

      try {
        unlistenBalanceUpdate = await listen<unknown>(
          "balance",
          balanceListenCb,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logError("Failed to listen for balance updates: " + errorMsg);
      }

      try {
        const cached = await invoke<{
          status: { Ok: StatusResponse } | { Err: string };
          balance: { Ok: BalanceResponse } | { Err: string };
          service_info: unknown;
        }>("get_cached_state");

        try {
          listenCb({ payload: cached.status, id: -1, event: "status" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          criticalError("Failed to hydrate status: " + msg);
        }
        try {
          balanceListenCb({
            payload: cached.balance,
            id: -1,
            event: "balance",
          });
        } catch (err) {
          logWarn(`Failed to hydrate balance: ${err}`);
        }
        if (cached.service_info) {
          const parsed = ServiceInfoSchema.safeParse(cached.service_info);
          if (parsed.success) {
            setState("serviceInfo", parsed.data);
          } else {
            const issues = parsed.error.issues
              .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
              .join("; ");
            criticalError(`Invalid service_info cache: ${issues}`);
          }
        }
      } catch (err) {
        logWarn(`get_cached_state unavailable: ${err}`);
      }
    },

    setScreen: (screen: AppScreen) => setState("currentScreen", screen),

    connect: async (targetId: string) => {
      setState("isLoading", true);
      // only for the log line — connecting to an unknown destination is a service-wide no-op
      const selected = state.availableDestinations.find(
        (d) => d.id === targetId,
      );
      if (selected) {
        const name = destinationLabel(selected);
        const short = shortAddress(selected.address);
        log(`Connecting to ${name} - ${short}`);
      }

      destinationMode?.applyUserInput({ type: "connectIssued", id: targetId });
      try {
        await VPNService.connect(targetId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(message);
        setState("error", message);
        setState("isLoading", false);
        return;
      }
      setState("isLoading", false);

      // best-effort — losing this only affects which destination auto-reconnect tries next
      try {
        await settingsActions.setLastConnectedDestination(targetId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to persist last connected destination: ${message}`);
      }
    },

    disconnect: async () => {
      setState("isLoading", true);
      try {
        await VPNService.disconnect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(message);
        setState("error", message);
      } finally {
        setState("isLoading", false);
      }
    },

    slideCommitted: (id: string) =>
      destinationMode?.applyUserInput({ type: "slideCommitted", id }),
    dragStarted: () => destinationMode?.applyUserInput({ type: "dragStarted" }),
    destinationListOpened: () => {
      destinationMode?.applyUserInput({ type: "listOpened" });
      if (pendingModeAppState) runQuickProbes(pendingModeAppState);
    },
    destinationListClosed: (picked: string | null) => {
      destinationMode?.applyUserInput({ type: "listClosed", picked });
    },
    refreshToolkit,
  } as const;

  // Re-probe whenever the daemon reports its package: a completed install
  // restarts the daemon, and that is the moment the version file has moved.
  createEffect(() => {
    if (!state.serviceInfo?.package_version) return;
    void refreshToolkit();
  });

  // The toolkit's reading of the version file wins; the daemon read the same
  // file and covers installs without the toolkit.
  createEffect((previous: string | undefined) => {
    const fromToolkit = state.toolkit.packageVersion;
    const resolved = fromToolkit ?? state.serviceInfo?.package_version ?? null;
    setState("packageVersion", resolved);
    // Everything update-facing keys off this, so a shared log must name it and
    // say which source won.
    const line = resolved
      ? `Package version ${resolved} (from ${
        fromToolkit ? "toolkit" : "daemon"
      })`
      : "Package version unknown: neither toolkit nor daemon reported one";
    if (line !== previous) logInfo(line);
    return line;
  });

  // Keep the persisted channel preference and install marker in step with the
  // installed package.
  createEffect(() => {
    if (!settingsActions.hydrated()) return; // avoid clobbering stored prefs with defaults
    const pkg = state.packageVersion;
    if (!pkg) return;
    const channel = resolveChannelResync({
      packageVersion: pkg,
      channel: settings.channel,
    });
    if (pkg === settings.installedVersion && !channel) return;
    void settingsActions.syncInstalledVersion(pkg, channel);
  });

  createEffect(() => {
    const d = resolveUpdateDecision({
      outcome: settings.lastCheckOutcome,
      packageVersion: state.packageVersion,
      dismissedVersion: settings.dismissedUpdateVersion,
    });
    setState("availableVersion", d.release?.version ?? null);
    setState("isUpdateAvailable", d.isUpdateAvailable);
    setState(
      "endOfLife",
      resolveEndOfLife({
        outcome: settings.lastCheckOutcome,
        endOfLife: settings.lastEndOfLife,
        packageVersion: state.packageVersion,
      }),
    );
  });

  return [state, actions] as const;
}

const appStore = createRoot(() => createAppStore());

export function useAppStore(): AppStoreTuple {
  return appStore;
}

function incomingStatusEvent(event: StatusEvent): StatusResponse | void {
  const rawRes = event.payload;
  if ("Ok" in rawRes) {
    if (rawRes.Ok === null) {
      return;
    }
    const res = StatusResponseSchema.safeParse(rawRes.Ok);
    if (res.success) {
      return res.data;
    } else {
      const issues = res.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid status response: ${issues}`);
    }
  } else {
    // the caller routes this through criticalError, which logs it
    throw new Error(rawRes.Err);
  }
}
