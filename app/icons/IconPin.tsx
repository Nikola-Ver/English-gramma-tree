interface Props {
  size?: number;
}

/**
 * Thumbtack / pushpin icon.
 *
 * Shape: a wide rounded-rectangle cap (the part your thumb presses) sitting
 * above a thin vertical shaft — the classic office pushpin silhouette that is
 * unmistakable at any small size.
 */
export function IconPin({ size = 13 }: Props) {
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
      {/* Wide flat cap */}
      <rect x="2" y="1.5" width="9" height="3" rx="1.5" />
      {/* Narrow collar connecting cap to shaft */}
      <path d="M5 4.5 L5 6 Q5 6.5 6.5 6.5 Q8 6.5 8 6 L8 4.5" />
      {/* Shaft / needle */}
      <line x1="6.5" y1="6.5" x2="6.5" y2="11.5" />
    </svg>
  );
}
