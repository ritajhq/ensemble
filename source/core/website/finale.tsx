import { DOCS_URL, GITHUB_URL } from "./constants.ts";
import { InstallCommand } from "./install-command.tsx";
import { SiteFooter } from "./site-footer.tsx";

export function Finale() {
  return (
    <>
      <section className="py-24">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">
            Join the ensemble.
          </h2>
          <p className="mt-4 text-lg text-stone">
            Install one binary, run{" "}
            <code className="font-mono text-base text-ink">ens init</code>, and
            your project has a shape it keeps.
          </p>
          <div className="mt-10">
            <InstallCommand />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href={DOCS_URL}
              className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-parchment transition hover:bg-aegean-deep"
            >
              Read the docs
            </a>
            <a
              href={GITHUB_URL}
              className="rounded-full px-6 py-3 text-sm font-medium text-ink ring-1 ring-ink/15 transition hover:bg-white"
            >
              Star on GitHub
            </a>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
