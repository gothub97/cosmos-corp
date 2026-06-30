/**
 * SageAvatar - geometric SVG bust of Sage, the Cosmos Corp infra/SRE mentor.
 *
 * Minimalist line-art in the game's phosphor-green CRT aesthetic: think ASCII
 * art promoted to vector. The beard is the defining feature at every size.
 *
 * Sizes:  sm = 28 px  |  md = 40 px  |  lg = 72 px
 * Colours: var(--color-phosphor-400) on var(--color-cosmos-panel)
 * ViewBox: fixed 0 0 40 40 - SVG scaling handles the rest.
 */

export interface SageAvatarProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_PX: Record<NonNullable<SageAvatarProps["size"]>, number> = {
  sm: 28,
  md: 40,
  lg: 72,
};

export default function SageAvatar({
  size = "md",
  className,
}: SageAvatarProps) {
  const px = SIZE_PX[size];

  return (
    <svg
      role="img"
      aria-label="Sage"
      viewBox="0 0 40 40"
      width={px}
      height={px}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Panel background */}
      <rect
        width="40"
        height="40"
        rx="4"
        fill="var(--color-cosmos-panel)"
      />

      {/* Ear stubs - flank the head, keep silhouette readable at sm */}
      <rect
        x="5"
        y="11"
        width="3"
        height="6"
        rx="1"
        fill="none"
        stroke="var(--color-phosphor-400)"
        strokeWidth="1.4"
      />
      <rect
        x="32"
        y="11"
        width="3"
        height="6"
        rx="1"
        fill="none"
        stroke="var(--color-phosphor-400)"
        strokeWidth="1.4"
      />

      {/* Head - geometric rounded rectangle */}
      <rect
        x="8"
        y="4"
        width="24"
        height="22"
        rx="5"
        fill="var(--color-cosmos-panel)"
        stroke="var(--color-phosphor-400)"
        strokeWidth="1.5"
      />

      {/* Eyes - horizontal bar style, steady and calm */}
      <rect
        x="12"
        y="13"
        width="5"
        height="2"
        rx="1"
        fill="var(--color-phosphor-400)"
      />
      <rect
        x="23"
        y="13"
        width="5"
        height="2"
        rx="1"
        fill="var(--color-phosphor-400)"
      />

      {/* Nose - a single short vertical stroke */}
      <line
        x1="20"
        y1="17"
        x2="20"
        y2="20"
        stroke="var(--color-phosphor-400)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* ─── Beard - the defining feature ────────────────────────────────── */}
      {/* Outer shape: trapezoid wider at top, narrows to rounded bottom */}
      <path
        d="M 9 23 L 31 23 Q 32 32 27 37 Q 20 40 13 37 Q 8 32 9 23 Z"
        fill="var(--color-cosmos-panel)"
        stroke="var(--color-phosphor-400)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Beard texture - three vertical strokes */}
      <line
        x1="14"
        y1="25"
        x2="13"
        y2="34"
        stroke="var(--color-phosphor-400)"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.65"
      />
      <line
        x1="20"
        y1="25"
        x2="20"
        y2="37"
        stroke="var(--color-phosphor-400)"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.65"
      />
      <line
        x1="26"
        y1="25"
        x2="27"
        y2="34"
        stroke="var(--color-phosphor-400)"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}
