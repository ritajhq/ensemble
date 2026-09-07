import { Container } from "../Container.tsx";
import { Logo } from "../Logo.tsx";
import { GITHUB_URL } from "../constants.ts";

export function Footer() {
  return (
    <footer className="border-t border-slate-100 py-10">
      <Container className="flex flex-col items-center justify-between gap-4 text-sm text-slate-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-4 opacity-60" />
          <span>Ensemble · MIT License</span>
        </div>
        <a href={GITHUB_URL} className="font-medium text-slate-600 transition hover:text-blue-600">
          github.com/ritajhq/ensemble
        </a>
      </Container>
    </footer>
  );
}
