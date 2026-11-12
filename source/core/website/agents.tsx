import { SectionHeading } from "./section-heading.tsx";
import { Meander } from "./meander.tsx";

const POINTS = [
  {
    title: "Nothing to search for",
    body:
      "Every concern has a fixed name and home, so an agent goes straight to the file that matters instead of reading the whole repository to find it.",
  },
  {
    title: "A skill that knows the rules",
    body:
      "The ensemble skill teaches your agent the layout, the CLI and the rules of a project, so it adds apps, kits and manifests where they belong.",
  },
  {
    title: "Diagrams that match reality",
    body:
      "ens status and ens delivery print give an agent the real shape of each workload, so it draws an architecture diagram that is accurate, not imagined.",
  },
];

/** The same structure that keeps people oriented keeps an agent oriented. */
export function Agents() {
  return (
    <section className="bg-ink text-parchment">
      <Meander className="text-ochre/40" />
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading
          tone="dark"
          kicker="Built for agents too"
          title="The structure is the context"
          lede="What makes a project easy to join for a new teammate makes it easy for an AI agent."
        />
        <dl className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          {POINTS.map((point, index) => (
            <div key={point.title}>
              <span className="font-mono text-xs text-ochre">
                {String(index + 1).padStart(2, "0")}
              </span>
              <dt className="mt-2 font-serif text-xl">{point.title}</dt>
              <dd className="mt-3 text-sm leading-relaxed text-parchment/70">
                {point.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <Meander className="text-ochre/40" />
    </section>
  );
}
