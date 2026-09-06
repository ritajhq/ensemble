const PRINCIPLES = [
  {
    title: "Each app is self-contained",
    body: "Everything an app needs to build lives under its own folder, so every piece can build and run independently of the others.",
  },
  {
    title: "Concerns live in their own top-level folder",
    body: "Source, packaging, and build output are kept apart, so you can focus on the layer you're working on without the others leaking in.",
  },
  {
    title: "Shared code is explicit and intentional",
    body: "Cross-cutting logic is pulled in deliberately, instead of apps reaching into each other's folders.",
  },
  {
    title: "Kits carry the mess so app folders don't have to",
    body: "Build and packaging logic lives behind a common contract. An app folder only ever states which kit it uses.",
  },
];

export function Principles() {
  return (
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          A workspace that stays tidy as it grows
        </h2>

        <dl className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {PRINCIPLES.map((principle) => (
            <div key={principle.title} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <dt className="font-semibold text-slate-900">{principle.title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-600">{principle.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
