const EXAMPLES = [
  "build every app through one CLI, whatever kit it uses",
  "pack a built app into a Docker image, OCI tarball, or binary",
  "bring a whole workload up locally with one command",
];

/** The tilted "here's what it lets you do" card beside the hero text. */
export function ExampleCard() {
  return (
    <div className="relative hidden lg:col-span-5 lg:block">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-3 rounded-xl bg-white/70" />
      <div className="relative -rotate-2 rounded-xl bg-white p-6 shadow-lg ring-1 ring-slate-900/5">
        <p className="font-mono text-sm text-slate-500">lets you do things like:</p>
        <ul className="mt-4 space-y-2.5 font-mono text-sm text-slate-700">
          {EXAMPLES.map((example) => (
            <li key={example} className="flex gap-2">
              <span aria-hidden="true" className="text-slate-400">—</span>
              {example}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
