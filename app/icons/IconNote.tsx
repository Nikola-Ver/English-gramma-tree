interface Props {
  size?: number;
}

/** Pencil / edit icon — used for the "Пометка" (note) action. */
export function IconNote({ size = 13 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 1.5L11 4L4.5 10.5H2V8L8.5 1.5Z" />
      <line x1="7" y1="3" x2="9.5" y2="5.5" />
    </svg>
  );
}
