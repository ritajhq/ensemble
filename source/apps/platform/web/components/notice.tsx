import type { ReactNode } from "react";
import { Banner, BannerDescription, BannerTitle } from "@ritaj/ui";

type Tone = "error" | "success" | "warning" | "info";

/** A one-line status: what failed, or what just happened. `details` is a sentence: it renders in a paragraph. */
export function Notice(
  { tone = "info", children, details }: {
    tone?: Tone;
    children: ReactNode;
    details?: string;
  },
) {
  return (
    <Banner status={tone} contrast="high">
      <BannerTitle>{children}</BannerTitle>
      {details && <BannerDescription>{details}</BannerDescription>}
    </Banner>
  );
}
