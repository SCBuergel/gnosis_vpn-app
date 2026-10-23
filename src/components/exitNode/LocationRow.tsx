import { createMemo, createUniqueId, Show } from "solid-js";
import type { DestinationState } from "@src/services/vpnService.ts";
import { useAppStore } from "@src/stores/appStore.ts";
import {
  destinationCountry,
  destinationFlag,
  destinationTitle,
  getExitData,
  isSelectable,
  rankContext,
} from "@src/utils/destinations.ts";
import { pickerGrade, pickerVerdict } from "@src/utils/pickerVerdict.ts";
import { isNetworkSettling } from "@src/utils/networkSettling.ts";
import {
  canBeFirstConnect,
  needsFirstConnect,
} from "@src/utils/firstConnect.ts";
import Flag from "../Flag.tsx";
import Tooltip from "../common/Tooltip.tsx";
import RouteTooltip from "./RouteTooltip.tsx";
import SignalBars from "./SignalBars.tsx";

/** One line of the location picker: flag, name, country, and the route's bars in one column. */
export default function LocationRow(props: {
  /** DOM id, so the search field can name the highlighted row through aria-activedescendant. */
  id: string;
  destinationState: DestinationState;
  current: boolean;
  highlighted: boolean;
  // Live clock for "Checked"; the picker owns it so the rows share one.
  nowSec: number;
  // Shows the row's tooltip without a pointer, e.g. for the keyboard-highlighted row.
  tooltipOpen?: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const [appState] = useAppStore();
  const descriptionId = createUniqueId();
  let barsRef: HTMLSpanElement | undefined;

  const destination = () => props.destinationState.destination;
  const exit = createMemo(() =>
    getExitData(props.destinationState, appState.probe)
  );
  const grade = createMemo(() =>
    pickerGrade(props.destinationState, exit(), rankContext(appState))
  );
  const routeHealth = () => props.destinationState.route_health ?? null;
  const firstConnect = () =>
    canBeFirstConnect(props.destinationState) &&
    needsFirstConnect(
      appState.balance,
      appState.destinations,
      rankContext(appState),
    );
  const settling = () =>
    isNetworkSettling(appState.runningSince, props.nowSec * 1000);
  const verdict = () =>
    pickerVerdict(grade(), routeHealth(), exit(), firstConnect(), settling());
  const connected = () =>
    appState.connected?.destination_id === destination().id;
  const tunnelRtt = () =>
    connected() ? appState.connected?.tunnel_ping_rtt ?? null : null;
  // The live destination stays pickable: its tunnel exists and the slot it fills is ours.
  const pickable = () =>
    props.current ||
    isSelectable(props.destinationState, rankContext(appState)) ||
    firstConnect();
  const accessibleName = () =>
    [
      destinationTitle(destination()),
      destinationCountry(destination()),
      verdict().headline,
      props.current ? "current" : null,
    ]
      .filter(Boolean)
      .join(", ");

  // Hovering anywhere on the row shows the route's details; the bubble hangs on
  // the bars column so it flips above or below without covering the row itself.
  return (
    <Tooltip
      content={
        <RouteTooltip
          verdict={verdict()}
          grade={grade()}
          routeHealth={routeHealth()}
          exit={exit()}
          tunnelRtt={tunnelRtt()}
          routing={destination().routing}
          connected={connected()}
          nowSec={props.nowSec}
        />
      }
      triggerClass="w-full"
      triggerRole="presentation"
      anchor={() => barsRef}
      position="auto"
      align="end"
      open={props.tooltipOpen}
      bubbleClass="max-w-64"
    >
      <div
        id={props.id}
        role="option"
        aria-selected={props.current}
        aria-disabled={!pickable()}
        aria-label={accessibleName()}
        aria-describedby={descriptionId}
        data-pickable={pickable()}
        class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs"
        classList={{
          "bg-accent text-accent-text": props.highlighted,
          "text-text-primary": !props.highlighted,
          "opacity-50": !pickable(),
        }}
        onMouseEnter={props.onHover}
        onClick={() => pickable() && props.onPick()}
      >
        <Flag code={destinationFlag(destination())} size="sm" />
        <span class="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span class="truncate font-semibold">
            {destinationTitle(destination())}
          </span>
          <Show when={destinationCountry(destination())}>
            {(country) => (
              <span
                class="truncate text-[11px]"
                classList={{
                  "text-accent-text/80": props.highlighted,
                  "text-text-secondary": !props.highlighted,
                }}
              >
                {country()}
              </span>
            )}
          </Show>
        </span>
        {/* One column: every row's bars sit at the same x, whatever their state. */}
        <span ref={barsRef} class="flex w-5 shrink-0 justify-end">
          <SignalBars grade={grade()} highlighted={props.highlighted} />
        </span>
      </div>
      {/* Always in the DOM so the description resolves; the portalled bubble mounts too late for that. */}
      <span id={descriptionId} class="sr-only">
        {`${verdict().headline}. ${verdict().context}`}
      </span>
    </Tooltip>
  );
}
