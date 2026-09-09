import { Container } from "../Container.tsx";

const REASONS = [
  {
    title: "No more one-off build scripts",
    body: "Each app is built through a configured kit, which can be reused, inspected, customized and replaced across apps and teams, no more polluting config files or scripts in your workspace.",
  },
  {
    title: "Agility through adaptability",
    body: "The build, pack, and deploy kits are pluggable, so you can adapt to new frameworks, runtimes, and deployment targets without rewriting your apps.",
  },
  {
    title: "Complete control",
    body: "Run your apps locally or remotely, in development or production, with a single CLI that orchestrates the whole lifecycle.",
  }
];

export function Problem() {
  return (
    <section className="py-20">
      <Container>
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-blue-600">
          The problem
        </p>
        <h2 className="mt-2 text-center font-serif text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Why do you need Ensemble
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-base leading-relaxed text-slate-600">
          The only way to go fast is to go well, having a tidy workspace with clear names and responsibilities is the key to building, packaging, and deploying your apps with confidence.
          Ensemble helps you to manage each aspect by defining the concepts that govern those steps.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {REASONS.map((reason, index) => (
            <div key={reason.title}>
              <span className="font-mono text-xs text-blue-600">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-semibold text-slate-900">{reason.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{reason.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
