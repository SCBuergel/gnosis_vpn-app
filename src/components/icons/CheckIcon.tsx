/** A plain check mark; colour comes from the parent's text colour. */
export default function CheckIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      class={props.class ?? "size-4"}
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
