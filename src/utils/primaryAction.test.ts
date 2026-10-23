import { describe, expect, it } from "vitest";
import type { AppState } from "@src/stores/appStore.ts";
import type {
  BalanceResponse,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import { BASE_APP_STATE } from "@src/testing/appState.ts";
import {
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
  unrecoverableRouteHealth,
} from "@src/testing/destinations.ts";
import { primaryActionEnabled } from "./primaryAction.ts";

function balance(channels_out: bigint): BalanceResponse {
  return {
    node: 0n,
    safe: 100n,
    channels_out,
    info: {
      node_address: "0xnode",
      node_peer_id: "peer",
      safe_address: "0xsafe",
    },
    funding_status: null,
    ideal_balance: null,
    capacity_allocations: null,
  };
}

/** Main screen, auto mode resting on destination `a`, with the given route health per id. */
function state(
  routes: Record<string, RouteHealthView>,
  channels_out: bigint | null,
  active = "a",
): AppState {
  const destinations = Object.fromEntries(
    Object.entries(routes).map(([id, route_health]) => [
      id,
      { destination: makeDestination({ id }), route_health },
    ]),
  );
  return {
    ...BASE_APP_STATE,
    vpnStatus: "Disconnected",
    destinations,
    balance: channels_out === null ? null : balance(channels_out),
    mode: { ...BASE_APP_STATE.mode, active },
  };
}

describe("primaryActionEnabled", () => {
  it("connects to a ready destination", () => {
    expect(primaryActionEnabled(state({ a: eligibleRouteHealth() }, 5n)))
      .toBe(true);
  });

  it("stays off without a route on a node that already has channels", () => {
    expect(primaryActionEnabled(state({ a: noPathRouteHealth() }, 5n))).toBe(
      false,
    );
    expect(primaryActionEnabled(state({ a: noPathRouteHealth() }, null))).toBe(
      false,
    );
  });

  it("lets a node without channels make its first connection", () => {
    expect(primaryActionEnabled(state({ a: noPathRouteHealth() }, 0n))).toBe(
      true,
    );
  });

  it("does not aim the first connection at a written-off or missing destination", () => {
    expect(
      primaryActionEnabled(
        state({ a: unrecoverableRouteHealth(), b: noPathRouteHealth() }, 0n),
      ),
    ).toBe(false);
    expect(
      primaryActionEnabled(state({ a: noPathRouteHealth() }, 0n, "zzz")),
    ).toBe(false);
  });

  it("is off while loading and on during a session", () => {
    expect(
      primaryActionEnabled({
        ...state({ a: eligibleRouteHealth() }, 5n),
        isLoading: true,
      }),
    ).toBe(false);
    expect(
      primaryActionEnabled({
        ...state({ a: noPathRouteHealth() }, 5n),
        vpnStatus: "Connected",
        connected: { destination_id: "a", since: 0, tunnel_ping_rtt: null },
      }),
    ).toBe(true);
  });
});
