import { createMemo, Match, Switch } from "solid-js";
import { Section } from "@src/components/common/GroupedList.tsx";
import {
  AddressCard,
  exactOrNull,
  NetworkLine,
  TokenRow,
} from "@src/components/funding/FundingPieces.tsx";
import StatusIndicator from "@src/components/status/StatusIndicator.tsx";
import { isPreparingSafeRunMode } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { FUNDING_COPY } from "@src/utils/fundingCopy.ts";
import {
  formatWxhopr,
  formatXdai,
  humanXdai,
  wxhoprDecimal,
} from "@src/utils/hopli.ts";
import {
  getPreparingSafeNodeAddress,
  isWxHOPRTransferred,
  isXDAITransferred,
} from "@src/utils/status.ts";

/** First run: the same card and rows as Add funds, with the daemon's recommended amounts and an arrival check per token. */
export default function Manually() {
  const [appState] = useAppStore();
  const wxhoprArrived = () => isWxHOPRTransferred(appState);
  const xdaiArrived = () => isXDAITransferred(appState);
  const ready = () => wxhoprArrived() && xdaiArrived();
  const serviceAvailable = () => appState.vpnStatus !== "ServiceUnavailable";

  const address = createMemo(() =>
    (getPreparingSafeNodeAddress(appState) ?? "").trim()
  );
  const preparing = () =>
    isPreparingSafeRunMode(appState.runMode)
      ? appState.runMode.PreparingSafe
      : null;
  const recommendation = () => preparing()?.balance_recommendation ?? null;

  const wxhoprHint = () => {
    const rec = recommendation();
    if (wxhoprArrived() || rec === null) return null;
    const rounded = formatWxhopr(rec.wxhopr, 3, "ceil");
    return {
      amount: `${rounded} wxHOPR`,
      exact: exactOrNull(
        `${wxhoprDecimal(rec.wxhopr)} wxHOPR`,
        `${rounded} wxHOPR`,
      ),
      after: ONBOARDING_COPY.hintAfter,
    };
  };
  const xdaiHint = () => {
    const rec = recommendation();
    if (xdaiArrived() || rec === null) return null;
    const rounded = formatXdai(rec.xdai, 3, "ceil");
    return {
      amount: `${rounded} xDAI`,
      exact: exactOrNull(`${formatXdai(rec.xdai, 18)} xDAI`, `${rounded} xDAI`),
      after: ONBOARDING_COPY.hintAfter,
    };
  };

  const waitingDetail = () =>
    wxhoprArrived()
      ? ONBOARDING_COPY.waitingFor("xDAI")
      : xdaiArrived()
      ? ONBOARDING_COPY.waitingFor("wxHOPR")
      : ONBOARDING_COPY.waitingDetail;

  return (
    <div class="flex h-full w-full flex-col gap-3 overflow-y-auto px-5 pb-5 pt-6 text-text-primary">
      <div class="flex flex-col gap-1">
        <h1 class="text-xl font-bold">{ONBOARDING_COPY.title}</h1>
        <p class="text-sm text-text-secondary">{ONBOARDING_COPY.intro}</p>
      </div>

      <AddressCard address={address()} />
      <NetworkLine />

      <Section title={FUNDING_COPY.whatToSend}>
        <TokenRow
          name={FUNDING_COPY.wxhopr.name}
          purpose={FUNDING_COPY.wxhopr.purpose}
          balance={formatWxhopr(preparing()?.node_wxhopr ?? 0n, 2)}
          status={wxhoprArrived()
            ? ONBOARDING_COPY.received
            : ONBOARDING_COPY.waiting}
          hint={wxhoprHint()}
        />
        <TokenRow
          name={FUNDING_COPY.xdai.name}
          purpose={FUNDING_COPY.xdai.purpose}
          balance={humanXdai(preparing()?.node_xdai ?? 0n)}
          status={xdaiArrived()
            ? ONBOARDING_COPY.received
            : ONBOARDING_COPY.waiting}
          hint={xdaiHint()}
        />
      </Section>

      <Switch>
        <Match when={!serviceAvailable()}>
          <div class="flex w-full justify-center">
            <StatusIndicator size="sm" whenOfflineOnly />
          </div>
        </Match>
        <Match when={ready()}>
          <div
            class="flex items-start gap-2.5 rounded-xl border border-vpn-light-green/40 bg-vpn-light-green/10 px-3 py-2.5"
            role="status"
          >
            <svg
              viewBox="0 0 16 16"
              class="mt-0.5 size-4 shrink-0 text-text-green"
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
            <span class="flex flex-col text-sm">
              <span class="font-bold text-text-green">
                {ONBOARDING_COPY.done.title}
              </span>
              <span class="text-text-green">{ONBOARDING_COPY.done.detail}</span>
            </span>
          </div>
        </Match>
        <Match when>
          <div
            class="flex items-start gap-2.5 rounded-xl border border-border bg-bg-surface px-3 py-2.5"
            role="status"
            aria-live="polite"
          >
            <span
              class="mt-0.5 size-4 shrink-0 animate-spin-smooth rounded-full border-2 border-border border-t-text-primary"
              aria-hidden="true"
            />
            <span class="flex flex-col text-sm">
              <span class="font-bold text-text-primary">
                {FUNDING_COPY.waiting.title}
              </span>
              <span class="text-text-secondary">{waitingDetail()}</span>
            </span>
          </div>
        </Match>
      </Switch>
    </div>
  );
}

/** First-run wording; the shared lines live in FUNDING_COPY. */
const ONBOARDING_COPY = {
  title: "Fund your VPN",
  intro: "Send both tokens to this address once; the app carries on by itself.",
  hintAfter: " to get started",
  received: "Received",
  waiting: "Waiting",
  waitingDetail: "Usually shows up within 2 minutes of sending.",
  waitingFor: (token: string) => `One down. Waiting for the ${token} now.`,
  done: {
    title: "Both arrived",
    detail: "Setting up your node. This takes a minute or two.",
  },
} as const;
