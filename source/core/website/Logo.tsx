interface LogoProps {
  className?: string;
}

/** The real docs/ensemble-logo.png, served by website/server (see server/ensemble-logo.ts). */
export function Logo({ className }: LogoProps) {
  return <img src="/ensemble-logo.png" alt="" className={className} />;
}
