type LogoMarkProps = {
  size?: number;
  className?: string;
};

/** Kura brand mark: a Japanese storehouse (蔵) holding documents. */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Kura"
      className={className}
    >
      <rect width="256" height="256" rx="58" fill="#2F6F4F" />
      <polygon points="94,56 162,56 208,116 48,116" fill="#F7F6F3" />
      <path
        d="M66 124 H190 V188 a12 12 0 0 1 -12 12 H78 a12 12 0 0 1 -12 -12 Z"
        fill="#F7F6F3"
      />
      <rect x="92" y="139" width="56" height="11" rx="5.5" fill="#2F6F4F" />
      <rect x="92" y="160" width="72" height="9" rx="4.5" fill="#2F6F4F" />
      <rect x="92" y="178" width="72" height="9" rx="4.5" fill="#2F6F4F" />
    </svg>
  );
}

/** Horizontal lockup: mark + "Kura" wordmark. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-lg font-bold tracking-tight text-kura-accent">
        Kura
      </span>
    </span>
  );
}
