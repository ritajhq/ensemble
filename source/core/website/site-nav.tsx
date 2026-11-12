import { Logo } from "./Logo.tsx";
import { GitHubMarkIcon } from "./Icon.tsx";
import { DOCS_URL, GITHUB_URL } from "./constants.ts";

/** Where the landing page lives. */
export const LANDING_URL = "/";

const LINKS = [
  { label: "Kits", href: "/kits" },
  { label: "Docs", href: DOCS_URL },
];

/** The top bar every page of this theme shares. */
export function SiteNav() {
  return (
    <nav className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <a href={LANDING_URL} className="flex items-center gap-2.5 text-ink">
        <Logo className="h-7 w-7" />
        <span className="font-serif text-lg">Ensemble</span>
      </a>
      <div className="flex items-center gap-6">
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="hidden text-sm text-stone transition hover:text-ink md:inline"
          >
            {link.label}
          </a>
        ))}
        <a
          href={GITHUB_URL}
          aria-label="Ensemble on GitHub"
          className="text-stone transition hover:text-ink"
        >
          <GitHubMarkIcon className="h-5 w-5" />
        </a>
        <a
          href={DOCS_URL}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-parchment transition hover:bg-aegean-deep"
        >
          Get started
        </a>
      </div>
    </nav>
  );
}
