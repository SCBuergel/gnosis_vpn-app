import { describe, expect, it } from "vitest";
import { describeStartupError } from "./startupError.ts";

describe("describeStartupError", () => {
  it("treats a stopped service as a wait with a start hint for the platform", () => {
    const view = describeStartupError(
      "Error processing status update: service not running",
      "linux",
    );
    expect(view.waiting).toBe(true);
    expect(view.title).toBe("Gnosis VPN service isn't running");
    expect(view.hint).toBe("sudo systemctl start gnosisvpn");
    expect(view.raw).toBeNull();
    expect(
      describeStartupError(
        "IO error: Connection refused (os error 111)",
        "unknown",
      ).hint,
    )
      .toBeNull();
    // What the backend reports when the app starts before the daemon's socket exists.
    expect(
      describeStartupError(
        "Error processing status update: not available",
        "linux",
      ).waiting,
    ).toBe(true);
  });

  it("names a schema mismatch and keeps the daemon's words", () => {
    const view = describeStartupError(
      "Invalid status response: root: x",
      "linux",
    );
    expect(view.waiting).toBe(false);
    expect(view.title).toBe("App and service don't match");
    expect(view.raw).toContain("Invalid status response");
  });

  it("shows anything else as is", () => {
    const view = describeStartupError(
      "Received empty status response",
      "macos",
    );
    expect(view.waiting).toBe(false);
    expect(view.raw).toBe("Received empty status response");
    expect(view.hint).toBeNull();
  });
});
