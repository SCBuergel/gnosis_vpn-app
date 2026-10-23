/** A magnifier for search fields; sized and coloured by the parent. */
export default function SearchIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      class={props.class}
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="M16 16l5 5" />
    </svg>
  );
}
