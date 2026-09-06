import { CommandLine } from "../CommandLine.tsx";
import { Logo } from "../Logo.tsx";
import { GITHUB_URL, INSTALL_COMMAND } from "../constants.ts";

export function Hero() {
  return (
    <header className="border-b border-slate-100">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-slate-900">
          <Logo className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-semibold tracking-tight">Ensemble</span>
        </div>
        <a
          href={GITHUB_URL}
          className="text-sm font-medium text-slate-600 transition hover:text-blue-600"
        >
          GitHub
        </a>
      </nav>

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-12 text-center sm:pt-20">
        <p className="text-sm font-medium uppercase tracking-widest text-blue-600">
          Open source · Deno-native
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          One workspace, one CLI, from first line of code to production.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
          Ensemble is a project layout and command-line tool that takes a TypeScript
          project from source through build, packaging, and deployment — without the
          structure decaying as the project grows.
        </p>

        <div className="mx-auto mt-10 flex max-w-md flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
          <a
            href={GITHUB_URL}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            View on GitHub
          </a>
        </div>
        <div className="mx-auto mt-4 max-w-lg">
          <CommandLine command={INSTALL_COMMAND} />
        </div>
      </div>
    </header>
  );
}
