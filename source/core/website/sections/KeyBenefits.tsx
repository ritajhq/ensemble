import { Container } from "../Container.tsx";

const BENEFITS = [
  {
    title: "Stay tidy at scale",
    body: "The workspace layout is the same on day one and year three — new app types mean a new folder, not a new one-off script.",
  },
  {
    title: "One CLI, every stage",
    body: "Build, pack, orchestrate, and release all go through ens — no bespoke Makefiles or shell scripts to maintain per project.",
  },
  {
    title: "Environments as configuration",
    body: "The same build/pack/workflow definitions behave differently per deploy context via variables, not forked code paths.",
  },
];

export function KeyBenefits() {
  return (
    <section className="bg-slate-50 py-20">
      <Container>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Built to stay out of your way
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title}>
              <h3 className="font-semibold text-slate-900">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{benefit.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
