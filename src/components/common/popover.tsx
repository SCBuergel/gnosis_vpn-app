import { onCleanup, onMount } from "solid-js";

/**
 * What the main screen's popovers (location picker, balance) share: the
 * column they keep to, the surface they draw, the arrow, and how they close.
 */

/** The column a popover spans or aligns to (the status card's edges) and the y it must not pass. */
export interface ColumnFrame {
  left: number;
  width: number;
  maxBottom: number;
}

/** Distance from the window edge a popover keeps, from the anchor to the arrow tip, and the arrow's width. */
export const POPOVER_MARGIN_PX = 8;
export const POPOVER_GAP_PX = 10;
export const POPOVER_ARROW_PX = 12;

export const POPOVER_SURFACE_CLASS =
  "fixed z-100 flex flex-col rounded-xl border border-border bg-bg-surface shadow-xl transition-[opacity,transform] duration-150 ease-out starting:-translate-y-1 starting:opacity-0";

/** The small square that points from the popover's top edge at its anchor. */
export function PopoverArrow(props: { left: number }) {
  return (
    <span
      class="absolute -top-[7px] size-3 rotate-45 border-l border-t border-border bg-bg-surface"
      style={{ left: `${props.left}px` }}
      aria-hidden="true"
    />
  );
}

/**
 * Esc or a press outside closes the popover. A press on the opener is left
 * to the opener, which toggles; while a nested dialog is up, Esc goes to it
 * and presses are ignored. Call inside the popover's component.
 */
export function createPopoverDismiss(opts: {
  popover: () => HTMLElement | undefined;
  opener?: () => HTMLElement | undefined;
  nested?: () => boolean;
  onEscapeNested?: () => void;
  onClose: () => void;
}): void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (opts.nested?.()) opts.onEscapeNested?.();
    else opts.onClose();
  };
  const onPointerDown = (e: PointerEvent) => {
    const target = e.target instanceof Node ? e.target : null;
    if (opts.nested?.()) return;
    if (target && opts.popover()?.contains(target)) return;
    if (target && opts.opener?.()?.contains(target)) return;
    opts.onClose();
  };
  let arm: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    // capture: the popover's own keys win over page shortcuts
    document.addEventListener("keydown", onKeyDown, true);
    // next tick: the opening click must not count as outside
    arm = setTimeout(
      () => document.addEventListener("pointerdown", onPointerDown),
      0,
    );
  });
  onCleanup(() => {
    // An unmount before the tick must not leave the listener armed.
    clearTimeout(arm);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onPointerDown);
  });
}
