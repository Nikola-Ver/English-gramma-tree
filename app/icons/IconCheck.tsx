interface Props {
  className?: string;
}

/** Checkmark icon — used inside the rule completion checkbox. */
export function IconCheck({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 9.5L7.5 13L14 6"
        stroke="#000"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
