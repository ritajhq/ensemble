interface LogoProps {
  className?: string;
}

/**
 * Stylized lyre mark, inline so it needs no static-asset pipeline from the
 * `react` kit's ssr target (which only emits main.js/index.css) — see
 * server/main.ts for the matching favicon use.
 */
export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M28 30 C 10 30, 6 18, 14 8" />
      <path d="M72 30 C 90 30, 94 18, 86 8" />
      <path d="M22 28 C 22 55, 32 72, 50 80 C 68 72, 78 55, 78 28" />
      <path d="M50 80 L 50 90" />
      <path d="M38 90 L 62 90" />
      <line x1="18" y1="30" x2="82" y2="30" />
      <line x1="35" y1="30" x2="35" y2="66" />
      <line x1="43.5" y1="30" x2="43.5" y2="73" />
      <line x1="50" y1="30" x2="50" y2="76" />
      <line x1="56.5" y1="30" x2="56.5" y2="73" />
      <line x1="65" y1="30" x2="65" y2="66" />
    </svg>
  );
}
