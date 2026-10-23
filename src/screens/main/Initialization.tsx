import { createResource, createSignal, Show } from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import type { ServiceInfo } from "@src/services/vpnService.ts";
import Spinner from "@src/components/common/Spinner.tsx";
import GnosisVpnLogo from "@src/components/common/GnosisVpnLogo.tsx";
import { describeStartupError } from "@src/utils/startupError.ts";

interface InitializationProps {
  info: ServiceInfo | null;
  /** The store's canonical package version; `info` stays for service details. */
  packageVersion: string | null;
  error?: string;
}

const REVEAL_CLICKS = 7;
const REVEAL_WINDOW_MS = 2000;

export default function Initialization(props: InitializationProps) {
  const [appVersion] = createResource(() => getVersion());
  const [showDetails, setShowDetails] = createSignal(false);
  let clickCount = 0;
  let lastClickAt = 0;

  const handleVersionClick = () => {
    const now = Date.now();
    clickCount = now - lastClickAt > REVEAL_WINDOW_MS ? 1 : clickCount + 1;
    lastClickAt = now;
    if (clickCount >= REVEAL_CLICKS) {
      setShowDetails(true);
      clickCount = 0;
    }
  };

  return (
    <div class="relative h-full w-full text-center">
      {/* Logo geometry mirrors the splash in index.html so the mount handoff is seamless. */}
      <div class="absolute inset-x-0 top-[var(--golden-logo-y)] -translate-y-1/2 px-6">
        <GnosisVpnLogo class="w-full text-text-primary" />
      </div>

      <div class="absolute inset-x-0 top-[var(--golden-content-y)] flex flex-col items-center px-8 transition-opacity duration-300 ease-out starting:opacity-0">
        {props.error
          ? (
            <Show when={describeStartupError(props.error)} keyed>
              {(view) => (
                <div
                  class={`flex flex-col items-center ${
                    view.waiting ? "text-text-primary" : "text-status-error"
                  }`}
                >
                  <Show when={view.waiting}>
                    <Spinner class="mb-4 h-8 w-8 text-brand-primary" />
                  </Show>
                  <p class="mb-2 font-bold">{view.title}</p>
                  <Show when={view.detail}>
                    <p class="text-sm text-text-secondary">{view.detail}</p>
                  </Show>
                  <Show when={view.hint}>
                    {(hint) => (
                      <code class="mt-3 select-text rounded-md bg-bg-surface px-2.5 py-1.5 text-xs text-text-primary">
                        {hint()}
                      </code>
                    )}
                  </Show>
                  <Show when={view.raw}>
                    {(raw) => <p class="mt-2 select-text text-xs">{raw()}</p>}
                  </Show>
                </div>
              )}
            </Show>
          )
          : (
            <div class="flex flex-col items-center">
              <Spinner class="mb-4 h-8 w-8 text-brand-primary" />
              <p class="text-text-secondary">Running startup tasks</p>
            </div>
          )}

        <div
          class="mt-4 space-y-1 text-sm text-text-secondary text-center"
          classList={{ "select-text": showDetails() }}
        >
          <div
            onClick={handleVersionClick}
            class="cursor-default"
          >
            Version:{" "}
            <span class="text-text-primary">
              {props.packageVersion ?? "—"}
            </span>
          </div>
          <Show when={showDetails()}>
            <div class="text-xs">
              Service version:{" "}
              <span class="text-text-primary">
                {props.info?.version ?? "—"}
              </span>
            </div>
            <div class="text-xs">
              App version:{" "}
              <span class="text-text-primary">
                {appVersion() ?? "—"}
              </span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
