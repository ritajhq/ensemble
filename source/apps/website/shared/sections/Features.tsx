const FEATURES = [
  {
    title: "Self-contained apps",
    body: "Every app under source/apps/<name> builds and runs on its own — no reaching into siblings' folders.",
  },
  {
    title: "Pluggable build & pack kits",
    body: "Any app type — a plain TS service, a React SPA, whatever comes next — builds and packages through a common contract, not bespoke scripts.",
  },
  {
    title: "YAML workflows",
    body: "Define jobs as a DAG — dependencies, conditionals, matrix strategies — and run them locally or on a remote Ensemble server.",
  },
  {
    title: "One-command releases",
    body: "Compute, create, or undo semver release tags in one command, with dry-run previews instead of eyeballing git history.",
  },
  {
    title: "Deno-native, not the point",
    body: "ens itself installs as one native binary. Dependency resolution and bundling are Deno's problem, not yours to script.",
  },
  {
    title: "Environments as configuration",
    body: "The same build/pack/workflow definitions behave differently per deploy context via variables, so environments are configuration, not forked code.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Everything a project needs, none of the glue scripts
      </h2>

      <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title}>
            <h3 className="font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
