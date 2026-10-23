import { createSignal, onCleanup } from "solid-js";

export default function IconButton(props: {
  icon: string;
  alt: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  ref?: (el: HTMLButtonElement) => void;
  // For a button that opens a popover: what it opens and whether it is open.
  haspopup?: "dialog";
  expanded?: boolean;
}) {
  const [pressed, setPressed] = createSignal(false);
  let pressTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  onCleanup(() => {
    globalThis.clearTimeout(pressTimeout);
  });

  const playPressAnimation = () => {
    globalThis.clearTimeout(pressTimeout);
    setPressed(false);
    requestAnimationFrame(() => {
      setPressed(true);
      pressTimeout = globalThis.setTimeout(() => setPressed(false), 160);
    });
  };

  return (
    <button
      ref={props.ref}
      aria-haspopup={props.haspopup}
      aria-expanded={props.haspopup ? props.expanded : undefined}
      aria-label={props.alt}
      class="p-2 rounded-2xl bg-accent hover:bg-accent-hover w-10 h-10 flex items-center justify-center transition-transform duration-150 ease-out select-none focus:outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus"
      classList={{ "btn-press": pressed() }}
      onPointerDown={() => playPressAnimation()}
      onClick={props.onClick}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      type="button"
    >
      <img src={props.icon} alt="" class="w-5 h-5" />
    </button>
  );
}
