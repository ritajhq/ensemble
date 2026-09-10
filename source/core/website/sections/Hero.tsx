import { Container } from "../Container.tsx";
import { ExampleCard } from "../example-card.tsx";
import { InstallCommand } from "../InstallCommand.tsx";
import { Logo } from "../Logo.tsx";
import { DocsIcon, GitHubMarkIcon, RepoIcon } from "../Icon.tsx";
import { GITHUB_URL } from "../constants.ts";

const LINKS = [
  { label: "Explore the repo", href: GITHUB_URL, icon: RepoIcon },
  { label: "Read the docs", href: `${GITHUB_URL}#readme`, icon: DocsIcon },
];

const CHECKS = ["Single native binary", "MIT licensed"];

export function Hero() {
  return (
    <header className="bg-hero-mesh border-b border-slate-100">
      <Container className="flex items-center justify-between py-6">
        <div className="flex items-center gap-3 text-slate-900">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">Ensemble</span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            Technical Preview
          </span>
        </div>
        <div className="flex items-center gap-5">
          <a
            href={`${GITHUB_URL}#readme`}
            className="text-sm font-medium text-slate-600 transition hover:text-blue-600"
          >
            Documentation
          </a>
          <a
            href={GITHUB_URL}
            aria-label="Ensemble on GitHub"
            className="text-slate-700 transition hover:text-slate-900"
          >
            <GitHubMarkIcon className="h-5 w-5" />
          </a>
        </div>
      </Container>

      <Container className="grid grid-cols-1 items-center gap-12 py-16 lg:grid-cols-12 lg:py-24">
        <div className="lg:col-span-7">
          <a
            href="#"
            className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            v1.0.10-alpha · Release
            <span aria-hidden="true">→</span>
          </a>

          <h1 className="mt-5 max-w-3xl font-serif text-4xl font-bold leading-[1.15] tracking-tight text-slate-900 lg:text-[4.25rem] lg:leading-18">
            A workspace orchestrator for <span className="text-blue-600">building</span>,{" "}
            <span className="text-emerald-600">packaging</span>, and{" "}
            <span className="text-amber-600">deploying</span> your apps.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed tracking-wide text-slate-600">
            Ensemble sets your workspace and orchestrates pluggable kits to build, package, and deploy through a
            single CLI.
          </p>

          <div className="mt-8">
            <InstallCommand />
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map(({ label, href, icon: LinkIcon }) => (
              <a
                key={label}
                href={href}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-blue-600"
              >
                <LinkIcon className="h-4 w-4" />
                {label}
              </a>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
            {CHECKS.map((check) => (
              <span key={check} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="text-blue-600">✓</span>
                {check}
              </span>
            ))}
          </div>
        </div>

        <ExampleCard />
      </Container>
    </header>
  );
}
