import { describe, expect, it } from "vitest";
import { WarmupStatusSchema } from "@src/services/vpnService.ts";
import { friendlyWarmupStatus, readyLocationsLine } from "./startupCopy.ts";

describe("friendlyWarmupStatus", () => {
  it("has plain words for every warmup state", () => {
    for (const status of WarmupStatusSchema.options) {
      const line = friendlyWarmupStatus(status);
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toMatch(/runtime|edge client|ledger|config/i);
    }
  });

  it("names the states a user waits on most", () => {
    expect(friendlyWarmupStatus("StartingNode")).toBe(
      "Joining the HOPR network",
    );
    expect(friendlyWarmupStatus("WaitingForFunds")).toBe(
      "Waiting for your funds to arrive",
    );
  });
});

describe("readyLocationsLine", () => {
  it("counts ready locations out of all listed", () => {
    expect(readyLocationsLine({ ready: 0, total: 8 })).toBe(
      "0 of 8 locations ready",
    );
    expect(readyLocationsLine({ ready: 3, total: 8 })).toBe(
      "3 of 8 locations ready",
    );
  });

  it("says nothing before the daemon lists anything", () => {
    expect(readyLocationsLine({ ready: 0, total: 0 })).toBeNull();
  });
});
