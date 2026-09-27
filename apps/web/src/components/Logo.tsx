interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * The Canvasly mark: a rounded canvas tile with a violet→cyan gradient and a
 * hand-drawn white "C" (an open arc, like a stroke of a pen).
 */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="canvasly-mark-gradient"
          x1="8"
          y1="6"
          x2="56"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#6C5CE7" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="15" fill="url(#canvasly-mark-gradient)" />
      <path
        d="M43.5 21.5 A 16 16 0 1 0 43.5 42.5"
        stroke="#ffffff"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LogoProps {
  size?: number;
  className?: string;
}

/** Mark + wordmark lockup. Colour follows the surrounding text colour. */
export function Logo({ size = 26, className }: LogoProps) {
  return (
    <span className={`inline-flex select-none items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span
        className="font-bold tracking-tight"
        style={{ fontSize: Math.round(size * 0.8), lineHeight: 1 }}
      >
        Canvasly
      </span>
    </span>
  );
}
