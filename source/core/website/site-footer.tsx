import { Logo } from "./Logo.tsx";
import { GITHUB_URL } from "./constants.ts";
import { Meander } from "./meander.tsx";

/** The bottom bar every page of this theme shares. */
export function SiteFooter() {
  return (
    <footer>
      <Meander className="text-ochre/35" />
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-stone sm:flex-row sm:px-6">
        <span className="flex items-center gap-2">
          <Logo className="h-4 w-4" />
          Ensemble · MIT License
        </span>
        <a href={GITHUB_URL} className="transition hover:text-ink">
          github.com/ritajhq/ensemble
        </a>
      </div>
    </footer>
  );
}
