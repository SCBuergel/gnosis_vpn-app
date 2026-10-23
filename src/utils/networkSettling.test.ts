import { describe, expect, it } from "vitest";
import { isNetworkSettling, SETTLE_MS } from "./networkSettling.ts";

describe("isNetworkSettling", () => {
  it("is true for the first minutes after the node reached Running", () => {
    expect(isNetworkSettling(1_000, 1_000 + SETTLE_MS - 1)).toBe(true);
    expect(isNetworkSettling(1_000, 1_000 + SETTLE_MS)).toBe(false);
  });

  it("is false when the app never saw the node start", () => {
    expect(isNetworkSettling(null, 5_000)).toBe(false);
  });
});
