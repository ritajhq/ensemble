import { CommandLine } from "../CommandLine.tsx";
import { GITHUB_URL, INSTALL_COMMAND } from "../constants.ts";

export function InstallCta() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Try it on your next project
      </h2>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">
        Linux (x64) for now, with more platforms on the way.
      </p>

      <div className="mx-auto mt-8 max-w-lg">
        <CommandLine command={INSTALL_COMMAND} />
      </div>

      <a
        href={GITHUB_URL}
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        View on GitHub
      </a>
    </section>
  );
}
