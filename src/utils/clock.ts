import { type Accessor, createSignal, onCleanup } from "solid-js";

/** `Date.now()` as a signal that ticks every `periodMs`; stops with its owner. */
export function createClock(periodMs: number): Accessor<number> {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), periodMs);
  onCleanup(() => clearInterval(timer));
  return now;
}
