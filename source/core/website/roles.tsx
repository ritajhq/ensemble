import { SectionHeading } from "./section-heading.tsx";

/** The ensemble metaphor, cast: who plays which part in a project. */
const ROLES = [
  {
    numeral: "Α",
    role: "The players",
    cast: "your apps",
    body:
      "Each app is self-contained under source/apps, in whichever language suits it: Deno, Node or Rust, side by side.",
  },
  {
    numeral: "Β",
    role: "The instruments",
    cast: "kits",
    body:
      "Build, pack and deploy logic lives in kits behind one contract, vendored where you can read and tune them.",
  },
  {
    numeral: "Γ",
    role: "The score",
    cast: "delivery.yml",
    body:
      "One manifest says what a workload is. Any deploy kit can perform it, on your laptop or in the cloud.",
  },
  {
    numeral: "Δ",
    role: "The conductor",
    cast: "ens",
    body:
      "One CLI cues every step: build, pack, deploy, develop and release, each the same way for every app.",
  },
];

export function Roles() {
  return (
    <section id="roles" className="scroll-mt-8 pt-16 pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          kicker="The cast"
          title="Everyone knows their part"
          lede="Projects decay when nothing says where things go. Ensemble gives every piece a role, so the whole stays in tune as it grows."
        />
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => (
            <article
              key={role.role}
              className="group relative overflow-hidden rounded-2xl border border-ink/8 bg-white/70 p-6 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ochre/10"
            >
              <span
                aria-hidden="true"
                className="absolute -top-4 right-3 font-serif text-8xl text-ochre/15 transition group-hover:text-ochre/25"
              >
                {role.numeral}
              </span>
              <h3 className="relative font-serif text-xl text-ink">
                {role.role}
              </h3>
              <p className="relative mt-1 font-mono text-xs text-aegean">
                {role.cast}
              </p>
              <p className="relative mt-4 text-sm leading-relaxed text-stone">
                {role.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
