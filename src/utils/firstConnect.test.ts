import { describe, expect, it } from "vitest";
import type {
  BalanceResponse,
  DestinationState,
  RouteHealthView,
} from "@src/services/vpnService.ts";
import { NO_CONTEXT } from "./destinations.ts";
import { canBeFirstConnect, needsFirstConnect } from "./firstConnect.ts";
import {
  eligibleRouteHealth,
  makeDestination,
  noPathRouteHealth,
  unrecoverableRouteHealth,
} from "@src/testing/destinations.ts";

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

function dest(id: string, route_health: RouteHealthView): DestinationState {
  return { destination: makeDestination({ id }), route_health };
}

const NO_ROUTE = { a: dest("a", noPathRouteHealth()) };

describe("needsFirstConnect", () => {
  it("is true for a node without channels whose exits all lack a route", () => {
    expect(needsFirstConnect(balance(0n), NO_ROUTE, NO_CONTEXT)).toBe(true);
    expect(
      needsFirstConnect(
        balance(0n),
        { ...NO_ROUTE, b: dest("b", noPathRouteHealth()) },
        NO_CONTEXT,
      ),
    ).toBe(true);
  });

  it("is false before the balance is known", () => {
    expect(needsFirstConnect(null, NO_ROUTE, NO_CONTEXT)).toBe(false);
  });

  it("is false once the node has channels: a missing route is then a real one", () => {
    expect(needsFirstConnect(balance(1n), NO_ROUTE, NO_CONTEXT)).toBe(false);
  });

  it("is false while something is selectable or nothing is listed", () => {
    expect(
      needsFirstConnect(
        balance(0n),
        { ...NO_ROUTE, b: dest("b", eligibleRouteHealth()) },
        NO_CONTEXT,
      ),
    ).toBe(false);
    expect(needsFirstConnect(balance(0n), {}, NO_CONTEXT)).toBe(false);
  });

  it("is false when every exit is written off", () => {
    expect(
      needsFirstConnect(
        balance(0n),
        { a: dest("a", unrecoverableRouteHealth()) },
        NO_CONTEXT,
      ),
    ).toBe(false);
  });
});

describe("canBeFirstConnect", () => {
  it("accepts only a destination the daemon still calls NotRoutable", () => {
    expect(canBeFirstConnect(dest("a", noPathRouteHealth()))).toBe(true);
    expect(canBeFirstConnect(dest("a", eligibleRouteHealth()))).toBe(false);
    expect(canBeFirstConnect(dest("a", unrecoverableRouteHealth()))).toBe(
      false,
    );
    expect(canBeFirstConnect(undefined)).toBe(false);
  });
});
