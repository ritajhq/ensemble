import { useState } from "react";
import { Container } from "../Container.tsx";

interface CliTab {
  name: string;
  description: string;
  command: string;
  output: string;
}

const TABS: CliTab[] = [
  {
    name: "Build",
    description: "Builds an app through its configured build kit — a plain TS service, a React SPA, whatever comes next.",
    command: "ens build web -m production",
    output: "built web",
  },
  {
    name: "Pack",
    description: "Packs a built app into a deployable artifact: a Docker image, an OCI tarball, or a compiled binary.",
    command: "ens pack web docker -o my-web-image:latest",
    output: "packed web → my-web-image:latest",
  },
  {
    name: "Workflow",
    description: "Runs a YAML-defined job DAG — dependencies, conditionals, matrix strategies — locally or on a remote server.",
    command: "ens workflow deploy -j build",
    output: "resolved 2 jobs → running build",
  },
  {
    name: "Release",
    description: "Computes, creates, or undoes a semver release tag, with dry-run previews instead of eyeballing git history.",
    command: "ens release next patch --dry-run",
    output: "next: v1.4.2 (from v1.4.1)",
  },
  {
    name: "Deploy",
    description: "Brings a declared workload up locally for development, or reconciles it to its declared state in production.",
    command: "ens develop web",
    output: "Listening on http://localhost:8000",
  },
];

export function CliTabs() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = TABS[activeIndex];

  return (
    <section className="py-20">
      <Container>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          One CLI for the whole lifecycle
        </h2>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {TABS.map((tab, index) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                index === activeIndex
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 items-center gap-8 sm:grid-cols-2">
          <p className="text-base leading-relaxed text-slate-600">{active.description}</p>

          <div className="overflow-x-auto rounded-xl bg-slate-900 p-5 font-mono text-sm text-slate-100 shadow-sm">
            <div className="flex items-center gap-2 text-blue-400">
              <span className="select-none">$</span>
              <span className="whitespace-pre">{active.command}</span>
            </div>
            <div className="mt-2 whitespace-pre text-slate-400">{active.output}</div>
          </div>
        </div>
      </Container>
    </section>
  );
}
