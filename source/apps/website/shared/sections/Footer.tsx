import { Logo } from "../Logo.tsx";
import { GITHUB_URL } from "../constants.ts";

export function Footer() {
  return (
    <footer className="border-t border-slate-100 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-4 text-slate-400" />
          <span>Ensemble · MIT License</span>
        </div>
        <a href={GITHUB_URL} className="font-medium text-slate-600 transition hover:text-blue-600">
          github.com/ritajhq/ensemble
        </a>
      </div>
    </footer>
  );
}
