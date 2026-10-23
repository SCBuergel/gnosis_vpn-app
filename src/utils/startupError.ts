/**
 * What the splash says when the daemon cannot be reached. The socket errors
 * come from gnosis_vpn-lib's root socket; everything else is shown as is.
 */
import { type Platform, platformFromUserAgent } from "@src/utils/platform.ts";

export interface StartupErrorView {
  /** The service is merely stopped: the app keeps polling and recovers by itself. */
  waiting: boolean;
  title: string;
  detail: string;
  /** A command or a place to go, shown as code. */
  hint: string | null;
  /** The daemon's own words, for a report; null when the title already says it all. */
  raw: string | null;
}

// "not available" is what the backend says while the daemon's socket is absent at app start.
const NOT_RUNNING =
  /service not running|connection refused|os error (2|111)\b|not available/i;
const MISMATCH = /invalid (status|service_info)/i;

// Only the Linux unit name is known for sure (the apt package installs `gnosisvpn`).
const START_HINT: Record<Platform, string | null> = {
  linux: "sudo systemctl start gnosisvpn",
  macos: null,
  windows: null,
  unknown: null,
};

export function describeStartupError(
  message: string,
  platform: Platform = platformFromUserAgent(),
): StartupErrorView {
  if (NOT_RUNNING.test(message)) {
    return {
      waiting: true,
      title: "Gnosis VPN service isn't running",
      detail: START_HINT[platform] === null
        ? "The app talks to a background service, and that service is stopped. Reinstalling Gnosis VPN restores it; the app reconnects by itself as soon as it is back."
        : "The app talks to a background service, and that service is stopped. The app reconnects by itself as soon as it is back.",
      hint: START_HINT[platform],
      raw: null,
    };
  }
  if (MISMATCH.test(message)) {
    return {
      waiting: false,
      title: "App and service don't match",
      detail:
        "The service answered in a form this version of the app does not understand. Updating both usually fixes it.",
      hint: null,
      raw: message,
    };
  }
  return {
    waiting: false,
    title: "Can't reach the Gnosis VPN service",
    detail: "",
    hint: null,
    raw: message,
  };
}
