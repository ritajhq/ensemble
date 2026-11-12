/**
 * Not upstream: a Fumadocs framework adapter for multi-page sites without a
 * client-side router, where every link is a full page load. The server
 * renders with the request's pathname and the client hydrates with the same
 * one, so both agree on which page is active.
 */
import type { ReactNode } from "react";
import { FrameworkProvider, type Router } from "../core/framework/index.tsx";

const router: Router = {
  push: (url) => location.assign(url),
  refresh: () => location.reload(),
};

const noParams = () => ({});
const useRouter = () => router;

interface StaticFrameworkProps {
  /** The page being rendered, as the server saw it. */
  pathname: string;
  children: ReactNode;
}

export function StaticFramework({ pathname, children }: StaticFrameworkProps) {
  return (
    <FrameworkProvider
      usePathname={() => pathname}
      useParams={noParams}
      useRouter={useRouter}
    >
      {children}
    </FrameworkProvider>
  );
}
