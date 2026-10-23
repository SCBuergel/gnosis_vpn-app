import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  on,
  onCleanup,
  Switch,
} from "solid-js";
import { Section } from "@src/components/common/GroupedList.tsx";
import {
  AddressCard,
  ArrivalNotice,
  exactOrNull,
  NetworkLine,
  TokenRow,
  WaitingNotice,
} from "@src/components/funding/FundingPieces.tsx";
import {
  fundingStatusOf,
  preparingSafeOf,
  VPNService,
} from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import { logInfo, logWarn } from "@src/utils/appLog.ts";
import { sumCapacityStake } from "@src/utils/credit.ts";
import {
  deriveNodeStatus,
  deriveRefillShortfall,
  deriveTrafficStatus,
  deriveWxhoprDeficit,
  deriveXdaiDeficit,
} from "@src/utils/funding.ts";
import { FUNDING_COPY } from "@src/utils/fundingCopy.ts";
import {
  formatWxhopr,
  formatXdai,
  humanWxhopr,
  humanXdai,
  wxhoprDecimal,
} from "@src/utils/hopli.ts";
import {
  type Balances,
  IDLE,
  observe,
  startWaiting,
  type TransferWatch,
  wantsFastPolling,
} from "@src/utils/transferWatch.ts";
import { createClock } from "@src/utils/clock.ts";

/** Where to send funds, what to send, and whether they have arrived. */
export default function AddFundsPage() {
  const [appState] = useAppStore();

  const preparingSafe = () => preparingSafeOf(appState.runMode);
  const runModeStatus = createMemo(() => fundingStatusOf(appState.runMode));
  const address = () =>
    (preparingSafe()?.node_address ?? appState.balance?.info.node_address ??
      "").trim();
  const balances = createMemo((): Balances => ({
    wxhopr: preparingSafe()?.node_wxhopr ??
      (appState.balance ? sumCapacityStake(appState.balance) : 0n),
    xdai: preparingSafe()?.node_xdai ?? appState.balance?.node ?? 0n,
  }));
  const trafficStatus = () =>
    deriveTrafficStatus(appState.balance, runModeStatus());
  const gasStatus = () => deriveNodeStatus(appState.balance, runModeStatus());
  const wxhoprDeficit = () =>
    deriveWxhoprDeficit(appState.balance, runModeStatus()) ??
      deriveRefillShortfall(appState.balance, runModeStatus());
  const xdaiDeficit = () =>
    deriveXdaiDeficit(appState.balance, runModeStatus());

  const wxhoprHint = () => {
    const deficit = wxhoprDeficit();
    if (!deficit) return null;
    const rounded = formatWxhopr(deficit, 3, "ceil");
    return {
      amount: `${rounded} wxHOPR`,
      exact: exactOrNull(
        `${wxhoprDecimal(deficit)} wxHOPR`,
        `${rounded} wxHOPR`,
      ),
    };
  };
  const xdaiHint = () => {
    const deficit = xdaiDeficit();
    if (!deficit) return null;
    const rounded = formatXdai(deficit, 3, "ceil");
    return {
      amount: `${rounded} xDAI`,
      exact: exactOrNull(`${formatXdai(deficit, 18)} xDAI`, `${rounded} xDAI`),
    };
  };

  // Copy / funding tool start the wait; every balance update is observed against the snapshot.
  const [watch, setWatch] = createSignal<TransferWatch>(IDLE);
  const beginWaiting = () => {
    if (watch().phase === "received") return;
    setWatch(startWaiting(balances(), Date.now()));
  };
  createEffect(on(balances, (b) => setWatch((w) => observe(w, b, Date.now()))));
  // The 15 minute fallback needs a clock, not just balance updates.
  createEffect(on(
    createClock(10_000),
    () => setWatch((w) => observe(w, balances(), Date.now())),
    { defer: true },
  ));

  // Faster balance polling only while waiting; off again when the page is left.
  createEffect(on(() => wantsFastPolling(watch()), (fast) => {
    VPNService.setBalancePollFast(fast).catch((e) => logWarn(`${e}`));
    if (fast) logInfo("Waiting for a transfer: balance polling sped up");
  }));
  onCleanup(() => {
    VPNService.setBalancePollFast(false).catch((e) => logWarn(`${e}`));
  });

  const receivedText = () => {
    const w = watch();
    if (w.phase !== "received") return null;
    return w.token === "wxhopr"
      ? {
        title: FUNDING_COPY.received.title(humanWxhopr(w.delta)),
        detail: FUNDING_COPY.received.traffic(humanWxhopr(w.balance)),
      }
      : {
        title: FUNDING_COPY.received.title(`${humanXdai(w.delta)} xDAI`),
        detail: FUNDING_COPY.received.gas(`${humanXdai(w.balance)} xDAI`),
      };
  };

  return (
    <>
      <AddressCard address={address()} onAction={beginWaiting} />
      <NetworkLine />

      <Section title={FUNDING_COPY.whatToSend}>
        <TokenRow
          name={FUNDING_COPY.wxhopr.name}
          purpose={FUNDING_COPY.wxhopr.purpose}
          balance={formatWxhopr(balances().wxhopr, 2)}
          status={trafficStatus()}
          hint={wxhoprHint()}
        />
        <TokenRow
          name={FUNDING_COPY.xdai.name}
          purpose={FUNDING_COPY.xdai.purpose}
          balance={humanXdai(balances().xdai)}
          status={gasStatus()}
          hint={xdaiHint()}
        />
      </Section>

      <Switch>
        <Match when={receivedText()}>
          {(text) => (
            <ArrivalNotice title={text().title} detail={text().detail} />
          )}
        </Match>
        <Match when={watch().phase === "waiting"}>
          <WaitingNotice
            title={FUNDING_COPY.waiting.title}
            detail={FUNDING_COPY.waiting.detail}
          />
        </Match>
        <Match when>
          <p class="text-sm text-text-secondary">{FUNDING_COPY.idle}</p>
        </Match>
      </Switch>
    </>
  );
}
