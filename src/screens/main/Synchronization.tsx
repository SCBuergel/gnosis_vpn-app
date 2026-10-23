import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { SyncPhaseIndex } from "@src/stores/screenSelector.ts";
import GnosisVpnLogo from "@src/components/common/GnosisVpnLogo.tsx";
import Spinner from "@src/components/common/Spinner.tsx";

export interface SynchronizationProps {
  syncProgress: number;
  /** Which of the three startup steps the daemon is in; null once none applies. */
  phase: SyncPhaseIndex | null;
  /** The daemon's own word for what it is doing right now. */
  statusLine: string;
  recoveryReason?: string | null;
}

/** The three things a node does before it can connect, in the order they happen. */
const STEPS: { title: string; detail: string }[] = [
  {
    title: "Creating your Safe",
    detail: "Your funds move into a wallet only your node controls.",
  },
  {
    title: "Starting your node",
    detail: "Joining the HOPR network and checking your balance.",
  },
  {
    title: "Finding routes",
    detail: "Looking for relays that can reach an exit.",
  },
];

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

/** Startup: which step the node is on, with the daemon's status under it; no invented percentages. */
export default function Synchronization(props: SynchronizationProps) {
  const [index, setIndex] = createSignal(0);
  const [visible, setVisible] = createSignal(true);
  const progress = () => Math.min(100, props.syncProgress);

  onMount(() => {
    let fade: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setVisible(false);
      fade = setTimeout(() => {
        setIndex((i) => (i + 1) % trivia.length);
        setVisible(true);
      }, FADE_MS);
    }, CYCLE_MS);
    onCleanup(() => {
      clearInterval(timer);
      clearTimeout(fade);
    });
  });

  const stepState = (i: number): "done" | "current" | "todo" => {
    const phase = props.phase;
    if (phase === null) return i < STEPS.length - 1 ? "done" : "current";
    return i < phase ? "done" : i === phase ? "current" : "todo";
  };

  return (
    <div class="flex h-full w-full flex-col bg-bg-primary px-6 pb-6 pt-8 text-text-primary">
      <GnosisVpnLogo class="w-40 self-center text-text-primary" />
      <h1 class="mt-8 text-xl font-bold">Getting ready</h1>
      <p class="mt-1 text-sm text-text-secondary">
        This happens once per node and takes a couple of minutes.
      </p>

      <ol class="mt-6 flex flex-col gap-4" aria-label="Startup steps">
        <For each={STEPS}>
          {(step, i) => (
            <li class="flex gap-3">
              <span class="flex size-5 shrink-0 items-center justify-center">
                <Show
                  when={stepState(i()) === "current"}
                  fallback={
                    <Show
                      when={stepState(i()) === "done"}
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
                  <Spinner class="size-4 text-text-primary" />
                </Show>
              </span>
              <span class="flex min-w-0 flex-col">
                <span
                  class={`text-sm ${
                    stepState(i()) === "todo"
                      ? "text-text-muted"
                      : "font-semibold text-text-primary"
                  }`}
                >
                  {step.title}
                </span>
                <Show when={stepState(i()) === "current"}>
                  <span class="text-xs text-text-secondary">
                    {props.statusLine || step.detail}
                  </span>
                </Show>
              </span>
            </li>
          )}
        </For>
      </ol>

      <div
        class="mt-6 h-1 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress())}
        aria-label="Startup progress"
      >
        <div
          class="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress()}%` }}
        />
      </div>

      <Show when={props.recoveryReason}>
        {(reason) => (
          <p class="mt-4 rounded-lg bg-vpn-orange/15 px-3 py-2 text-xs text-text-orange">
            Something went wrong; your node is retrying. {reason()}
          </p>
        )}
      </Show>

      <p
        class={`mt-auto text-center text-sm text-text-secondary transition-opacity duration-300 ${
          visible() ? "opacity-100" : "opacity-0"
        }`}
      >
        {trivia[index()]}
      </p>
    </div>
  );
}
