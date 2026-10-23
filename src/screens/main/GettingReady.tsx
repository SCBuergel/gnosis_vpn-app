import {
  createEffect,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import type { ServiceInfo } from "@src/services/vpnService.ts";
import type {
  RouteSearchProgress,
  SyncPhaseIndex,
} from "@src/stores/screenSelector.ts";
import GnosisVpnLogo from "@src/components/common/GnosisVpnLogo.tsx";
import Spinner from "@src/components/common/Spinner.tsx";
import { describeStartupError } from "@src/utils/startupError.ts";
import { formatDuration } from "@src/utils/exitHealth.ts";

export interface GettingReadyProps {
  /** The service has answered at least once this run; before that the first step waits. */
  connected: boolean;
  /** Why the service has not answered, if it said so. */
  error?: string;
  /** Which of the daemon's startup steps it is in; null once none applies. */
  phase: SyncPhaseIndex | null;
  /** The Safe is being set up in this run: the list shows that step and the longer estimate. */
  firstRun: boolean;
  /** The daemon's own word for what it is doing right now. */
  statusLine: string;
  routes: RouteSearchProgress | null;
  recoveryReason?: string | null;
  info: ServiceInfo | null;
  /** The store's canonical package version; `info` stays for service details. */
  packageVersion: string | null;
}

type StepKey = "service" | "safe" | "node" | "routes";
type StepState = "done" | "current" | "todo";

const STEPS: Record<StepKey, { title: string; detail: string }> = {
  service: {
    title: "Connecting to the service",
    detail: "Reaching the Gnosis VPN service on this computer.",
  },
  safe: {
    title: "Creating your Safe",
    detail: "Your funds move into a wallet only your node controls.",
  },
  node: {
    title: "Starting your node",
    detail: "Joining the HOPR network and checking your balance.",
  },
  routes: {
    title: "Finding routes",
    detail: "Asking the network for a path to each location.",
  },
};

/** The daemon's phase index for each step; the service step precedes them all. */
const PHASE_OF: Record<Exclude<StepKey, "service">, SyncPhaseIndex> = {
  safe: 0,
  node: 1,
  routes: 2,
};

/** After this long on one step, the wait gets a word of reassurance. */
const SLOW_AFTER_SEC = 60;
/** The route step shows how long it has been going once it is no longer instant. */
const SHOW_TIMER_AFTER_SEC = 5;

const trivia = [
  "Gnosis VPN routes your traffic through the HOPR mixnet.",
  "A mixnet hides metadata by relaying packets through independent nodes.",
  "Each packet is wrapped in layered encryption, like onion routing.",
  "HOPR nodes only know the previous and next hop, never the full route.",
  "Cover traffic makes real user traffic harder to analyze.",
  "Payments in HOPR are settled on Gnosis Chain.",
  "Anyone can run a HOPR node and earn rewards for relaying traffic.",
  "Packets are fixed-size to reduce traffic fingerprinting.",
  "Metadata, not content, is often the biggest privacy risk online.",
  "Privacy improves when more independent nodes participate.",
];

const CYCLE_MS = 9000;
const FADE_MS = 400;
const REVEAL_CLICKS = 7;
const REVEAL_WINDOW_MS = 2000;

/**
 * One screen from launch until the main screen can show: reaching the
 * service, then the daemon's own startup steps. The Safe step appears only
 * when a Safe is set up in this run; a later launch lists two steps and
 * promises seconds, not minutes.
 */
export default function GettingReady(props: GettingReadyProps) {
  const [appVersion] = createResource(() => getVersion());
  const [showDetails, setShowDetails] = createSignal(false);
  const [triviaIndex, setTriviaIndex] = createSignal(0);
  const [triviaVisible, setTriviaVisible] = createSignal(true);
  const [now, setNow] = createSignal(Date.now());
  let clickCount = 0;
  let lastClickAt = 0;

  const steps = (): StepKey[] =>
    props.firstRun
      ? ["service", "safe", "node", "routes"]
      : ["service", "node", "routes"];

  const stepState = (key: StepKey): StepState => {
    if (!props.connected) return key === "service" ? "current" : "todo";
    if (key === "service") return "done";
    const phase = props.phase ?? 2;
    const own = PHASE_OF[key];
    return own < phase ? "done" : own === phase ? "current" : "todo";
  };
  const current = () => steps().find((key) => stepState(key) === "current");

  // How long the current step has been running, for the slow-wait hint and the route counter.
  let stepSince = Date.now();
  createEffect(on(current, () => {
    stepSince = Date.now();
    setNow(stepSince);
  }));
  const stepSeconds = () => Math.floor((now() - stepSince) / 1000);

  const startupError = () =>
    props.error && !props.connected ? describeStartupError(props.error) : null;

  const estimate = () => {
    if (!props.connected) return "One moment.";
    return props.firstRun
      ? "This happens once per node and takes a couple of minutes."
      : "Takes a few seconds.";
  };

  // The daemon walks every exit, then walks again until one has a path.
  const routesLine = () => {
    const routes = props.routes;
    if (!routes || routes.total === 0) return null;
    const progress = routes.walked < routes.total
      ? `${routes.walked} of ${routes.total} locations checked`
      : `No path to ${routes.pending} locations yet, checking again`;
    return stepSeconds() >= SHOW_TIMER_AFTER_SEC
      ? `${progress} · ${formatDuration(stepSeconds())}`
      : progress;
  };

  const handleVersionClick = () => {
    const at = Date.now();
    clickCount = at - lastClickAt > REVEAL_WINDOW_MS ? 1 : clickCount + 1;
    lastClickAt = at;
    if (clickCount >= REVEAL_CLICKS) {
      setShowDetails(true);
      clickCount = 0;
    }
  };

  onMount(() => {
    let fade: ReturnType<typeof setTimeout> | undefined;
    const cycle = setInterval(() => {
      setTriviaVisible(false);
      fade = setTimeout(() => {
        setTriviaIndex((i) => (i + 1) % trivia.length);
        setTriviaVisible(true);
      }, FADE_MS);
    }, CYCLE_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => {
      clearInterval(cycle);
      clearInterval(clock);
      clearTimeout(fade);
    });
  });

  return (
    <div class="flex h-full w-full flex-col bg-bg-primary px-6 pb-5 pt-10 text-text-primary">
      {/* Logo geometry mirrors the splash in index.html so the mount handoff is seamless. */}
      <GnosisVpnLogo class="w-44 self-center text-text-primary" />
      <h1 class="mt-8 text-xl font-bold">Getting ready</h1>
      <p class="mt-1 text-sm text-text-secondary">{estimate()}</p>

      <ol class="mt-6 flex flex-col gap-4" aria-label="Startup steps">
        <For each={steps()}>
          {(key) => (
            <li class="flex gap-3">
              <span class="flex size-5 shrink-0 items-center justify-center">
                <Show
                  when={stepState(key) === "current"}
                  fallback={
                    <Show
                      when={stepState(key) === "done"}
                      fallback={
                        <span class="size-2 rounded-full bg-text-muted/40" />
                      }
                    >
                      <svg
                        viewBox="0 0 16 16"
                        class="size-4 text-text-green"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 8.5l3.2 3.2L13 5"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </Show>
                  }
                >
                  <Show
                    when={!(key === "service" && startupError() &&
                      !startupError()!.waiting)}
                    fallback={
                      <span
                        class="size-2 rounded-full bg-text-red"
                        aria-hidden="true"
                      />
                    }
                  >
                    <Spinner class="size-4 text-text-primary" />
                  </Show>
                </Show>
              </span>
              <span class="flex min-w-0 flex-col gap-0.5">
                <span
                  class={`text-sm ${
                    stepState(key) === "todo"
                      ? "text-text-muted"
                      : "font-semibold text-text-primary"
                  }`}
                >
                  {startupError() && key === "service"
                    ? startupError()!.title
                    : STEPS[key].title}
                </span>
                <Show when={stepState(key) === "current"}>
                  <Show
                    when={key === "service" && startupError()}
                    fallback={
                      <span class="text-xs text-text-secondary">
                        {key === "node" && props.statusLine
                          ? props.statusLine
                          : STEPS[key].detail}
                      </span>
                    }
                  >
                    {(view) => (
                      <>
                        <Show when={view().detail}>
                          <span class="text-xs text-text-secondary">
                            {view().detail}
                          </span>
                        </Show>
                        <Show when={view().hint}>
                          {(hint) => (
                            <code class="mt-1 w-fit select-text rounded-md bg-bg-surface px-2 py-1 text-xs text-text-primary">
                              {hint()}
                            </code>
                          )}
                        </Show>
                        <Show when={view().raw}>
                          {(raw) => (
                            <span class="select-text text-xs text-text-red">
                              {raw()}
                            </span>
                          )}
                        </Show>
                      </>
                    )}
                  </Show>
                  <Show when={key === "routes" && routesLine()}>
                    {(line) => (
                      <span class="text-xs text-text-muted">{line()}</span>
                    )}
                  </Show>
                  <Show
                    when={key !== "service" && stepSeconds() >= SLOW_AFTER_SEC}
                  >
                    <span class="text-xs text-text-secondary">
                      Taking longer than usual. The network may be busy; the app
                      carries on by itself.
                    </span>
                  </Show>
                </Show>
              </span>
            </li>
          )}
        </For>
      </ol>

      <Show when={props.recoveryReason}>
        {(reason) => (
          <p class="mt-4 rounded-lg bg-vpn-orange/15 px-3 py-2 text-xs text-text-orange">
            Something went wrong; your node is retrying. {reason()}
          </p>
        )}
      </Show>

      <p
        class={`mt-auto text-center text-sm text-text-secondary transition-opacity duration-300 ${
          triviaVisible() ? "opacity-100" : "opacity-0"
        }`}
      >
        {trivia[triviaIndex()]}
      </p>

      <div
        class="mt-3 text-center text-xs text-text-muted"
        classList={{ "select-text": showDetails() }}
      >
        <div onClick={handleVersionClick} class="cursor-default">
          Version {props.packageVersion ?? "—"}
        </div>
        <Show when={showDetails()}>
          <div>Service version: {props.info?.version ?? "—"}</div>
          <div>App version: {appVersion() ?? "—"}</div>
        </Show>
      </div>
    </div>
  );
}
