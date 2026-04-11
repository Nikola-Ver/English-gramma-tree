interface Props {
  size?: number;
}

/** Chain-link share icon — matches the rule/tense-level share button style. */
export function IconShare({ size = 11 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 11 11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M4.5 6.5l2-2" />
      <path d="M3.5 5L2 6.5a2.2 2.2 0 003.1 3.1L6.5 8" />
      <path d="M7.5 6L9 4.5A2.2 2.2 0 005.9 1.4L4.5 3" />
    </svg>
  );
}
