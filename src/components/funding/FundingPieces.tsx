import { createSignal, type JSX, onCleanup, Show } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import AddressQr from "@src/components/address/AddressQr.tsx";
import Tooltip from "@src/components/common/Tooltip.tsx";
import { logWarn } from "@src/utils/appLog.ts";
import type { StatusText } from "@src/utils/funding.ts";
import { FUNDING_COPY, FUNDING_TOOL_URL } from "@src/utils/fundingCopy.ts";

/**
 * The building blocks of "send funds here": shared by the Add funds page and
 * the first-run funding screen, so both show the same card, rows and words.
 */

const COPIED_MS = 2000;

const statusClass: Record<string, string> = {
  Sufficient: "text-text-green",
  Received: "text-text-green",
  Low: "text-text-orange",
  Empty: "text-text-red",
};

const BUTTON_CLASS =
  "h-8 rounded-md border border-border bg-bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-darken focus:outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus";

export function GnosisChainMark() {
  return (
    <span
      class="flex size-5 shrink-0 items-center justify-center rounded-full bg-owl text-[11px] font-bold text-bg-primary"
      aria-hidden="true"
    >
      G
    </span>
  );
}

/** The exact value only when the rounded display does not already spell it out. */
export function exactOrNull(exact: string, rounded: string): string | null {
  return exact === rounded ? null : exact;
}

/** "Send on Gnosis Chain only": the one thing that goes wrong most. */
export function NetworkLine() {
  return (
    <p class="flex items-center gap-2 text-sm text-text-primary">
      <GnosisChainMark />
      <span>
        {FUNDING_COPY.networkLine.before}
        <span class="font-bold">{FUNDING_COPY.networkLine.network}</span>
        {FUNDING_COPY.networkLine.after}
      </span>
    </p>
  );
}

export interface TokenHint {
  /** Carries the unit, e.g. "50 wxHOPR". */
  amount: string;
  exact: string | null;
  /** What follows the amount; the top-up wording unless given. */
  after?: string;
}

/** One "what to send" row: token, purpose, balance, status, and the deficit hint when there is one. */
export function TokenRow(props: {
  name: string;
  purpose: string;
  balance: string;
  status: StatusText;
  hint?: TokenHint | null;
}) {
  const hintText = (): JSX.Element => (
    <>
      {FUNDING_COPY.sendAtLeast.before}
      <span class="font-bold">{props.hint!.amount}</span>
      {props.hint!.after ?? FUNDING_COPY.sendAtLeast.after}
    </>
  );
  return (
    <div class="flex flex-col gap-2 px-3 py-2.5">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col">
          <span class="text-sm font-bold text-text-primary">{props.name}</span>
          <span class="text-xs text-text-secondary">{props.purpose}</span>
        </div>
        <div class="flex flex-col items-end">
          <span class="select-text font-mono text-base text-text-primary">
            {props.balance}
          </span>
          <span class="text-xs text-text-secondary">now</span>
          <span
            class={`text-xs font-bold ${
              statusClass[props.status] ?? "text-text-secondary"
            }`}
          >
            {props.status}
          </span>
        </div>
      </div>
      <Show when={props.hint}>
        {(hint) => (
          <div class="rounded-md bg-vpn-orange/15 px-2.5 py-1.5 text-xs text-text-orange">
            <Show
              when={hint().exact}
              fallback={<span>{hintText()}</span>}
            >
              {(exact) => (
                <Tooltip content={<span>{exact()}</span>} position="auto">
                  <span class="cursor-help">{hintText()}</span>
                </Tooltip>
              )}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

/** QR, the address, Copy and the funding tool. `onAction` fires when the user did something that may start a transfer. */
export function AddressCard(props: {
  address: string;
  onAction?: () => void;
}) {
  const [copied, setCopied] = createSignal(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copiedTimer));

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(props.address);
      setCopied(true);
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => setCopied(false), COPIED_MS);
      props.onAction?.();
    } catch (error) {
      logWarn(`Error copying address: ${String(error)}`);
    }
  };
  const openFundingTool = async () => {
    try {
      await openUrl(FUNDING_TOOL_URL);
      props.onAction?.();
    } catch (error) {
      logWarn(`Error opening the funding tool: ${String(error)}`);
    }
  };

  return (
    <div class="flex gap-4 rounded-xl border border-border bg-bg-surface p-3">
      <Show
        when={props.address}
        fallback={
          <span class="text-sm text-text-red">
            No Gnosis VPN address found
          </span>
        }
      >
        <AddressQr address={props.address} sizePx={104} />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <span class="text-[11px] font-bold uppercase tracking-wide text-text-secondary">
            {FUNDING_COPY.addressLabel}
          </span>
          <span class="select-text break-all font-mono text-xs leading-snug text-text-primary">
            {props.address}
          </span>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class={BUTTON_CLASS}
              onClick={() => void copyAddress()}
            >
              {copied() ? FUNDING_COPY.copied : FUNDING_COPY.copy}
            </button>
            <button
              type="button"
              class={BUTTON_CLASS}
              onClick={() => void openFundingTool()}
            >
              {FUNDING_COPY.fundingTool} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
