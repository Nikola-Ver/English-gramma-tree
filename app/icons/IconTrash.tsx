interface Props {
  size?: number;
}

/** Trash-bin / delete icon. */
export function IconTrash({ size = 11 }: Props) {
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
      <polyline points="2,3 11,3" />
      <path d="M4 3V2h5v1" />
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <line x1="5.5" y1="6" x2="5.5" y2="9" />
      <line x1="7.5" y1="6" x2="7.5" y2="9" />
    </svg>
  );
}
