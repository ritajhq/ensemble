import type { ReactNode } from "react";

interface ContainerProps {
  className?: string;
  children: ReactNode;
}

/** The one page-width every section aligns to — change it here, not per-section. */
export function Container({ className = "", children }: ContainerProps) {
  return <div className={`mx-auto max-w-5xl px-6 ${className}`.trim()}>{children}</div>;
}
