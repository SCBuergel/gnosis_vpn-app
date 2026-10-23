import { describe, expect, it } from "vitest";
import { refreezeNeeded } from "./frozenList.ts";

describe("refreezeNeeded", () => {
  const known = new Set(["a"]);

  it("leaves the list alone when only health changed", () => {
    const v = refreezeNeeded(["a", "b"], ["b", "a"], ["a"], known);
    expect(v.refreeze).toBe(false);
    expect(v.known).toBe(known);
  });

  it("re-freezes when a destination appears or disappears", () => {
    expect(refreezeNeeded(["a", "b"], ["a"], ["a"], known).refreeze).toBe(true);
    expect(refreezeNeeded(["a"], ["a", "c"], ["a"], known).refreeze).toBe(true);
  });

  it("re-freezes once per first measurement and remembers it", () => {
    const first = refreezeNeeded(["a", "b"], ["b", "a"], ["a", "b"], known);
    expect(first.refreeze).toBe(true);
    expect([...first.known].sort()).toEqual(["a", "b"]);
    const again = refreezeNeeded(
      ["b", "a"],
      ["b", "a"],
      ["a", "b"],
      first.known,
    );
    expect(again.refreeze).toBe(false);
  });
});
