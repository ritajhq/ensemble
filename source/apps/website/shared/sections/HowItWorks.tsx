const STAGES = [
  { name: "Source", detail: "Every app is self-contained under source/apps/<name>." },
  { name: "Build", detail: "A pluggable build kit turns source into build output." },
  { name: "Pack", detail: "A pluggable pack kit turns output into a deployable artifact." },
  { name: "Deploy", detail: "A YAML workflow orchestrates when and where it ships." },
];

export function HowItWorks() {
  return (
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          One pipeline, pluggable at every stage
        </h2>

        <ol className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-4">
          {STAGES.map((stage, index) => (
            <li key={stage.name} className="relative rounded-xl border border-slate-200 bg-white p-5">
              <span className="text-xs font-semibold text-blue-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-semibold text-slate-900">{stage.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{stage.detail}</p>
            </li>
          ))}
        </ol>

        <blockquote className="mx-auto mt-14 max-w-2xl border-l-4 border-blue-600 pl-6 text-lg italic leading-relaxed text-slate-700">
          "An app folder states which kit it uses, never how that kit does its
          job — adding a new app type never means inventing a new one-off script."
        </blockquote>
      </div>
    </section>
  );
}
