import { useEffect, useState } from "react";
import { Container } from "../Container.tsx";
import { ChevronLeftIcon, ChevronRightIcon, ReplayIcon } from "../Icon.tsx";

interface CliStep {
  name: string;
  description: string;
  command: string;
  output: string;
}

const STEPS: CliStep[] = [
  {
    name: "Build",
    description: "Builds an app through its configured build kit — a plain TS service, a React SPA, whatever comes next.",
    command: "ens build web -m production",
    output: "built web",
  },
  {
    name: "Pack",
    description: "Packs a built app into a deployable artifact: a Docker image, an OCI tarball, or a compiled binary.",
    command: "ens pack web docker",
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

const STEP_DURATION_MS = 4000;

export function CliTabs() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const active = STEPS[activeIndex];

  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      setActiveIndex((index) => (index + 1) % STEPS.length);
    }, STEP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [autoplay, activeIndex]);

  function goTo(index: number) {
    setAutoplay(false);
    setActiveIndex((index + STEPS.length) % STEPS.length);
  }

  function replay() {
    setAutoplay(true);
    setActiveIndex(0);
  }

  return (
    <section className="py-20">
      <Container>
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-blue-600">
          An overview
        </p>
        <h2 className="mt-2 text-center font-serif text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          One CLI for the whole workflow
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-slate-600">
          Build, pack, release, and deploy — every step is a command carefully designed.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
          <ol className="space-y-1">
            {STEPS.map((step, index) => {
              const isActive = index === activeIndex;
              return (
                <li key={step.name}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    className={`w-full rounded-lg px-4 py-3 text-left transition ${isActive ? "bg-slate-100" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className={`font-mono text-xs ${isActive ? "text-blue-600" : "text-slate-400"}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${isActive ? "text-slate-900" : "text-slate-600"}`}>
                          {step.name}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">$ {step.command}</p>
                        {isActive && (
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          key={activeIndex}
                          className={`h-full bg-blue-600 ${autoplay ? "animate-[cli-step-progress_4s_linear]" : "w-full"}`}
                        />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          <div>
            <div className="overflow-x-auto rounded-xl border border-term-border bg-term-bg shadow-sm">
              <div className="flex items-center justify-between border-b border-term-border px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-term-red" />
                  <span className="h-2.5 w-2.5 rounded-full bg-term-yellow" />
                  <span className="h-2.5 w-2.5 rounded-full bg-term-green" />
                </div>
                <span className="font-mono text-xs text-term-muted">
                  {String(activeIndex + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
                </span>
              </div>

              <div
                aria-hidden="true"
                className="flex w-max min-w-full items-stretch gap-3 border-b border-term-border px-4 font-mono text-[11px] tracking-wide whitespace-nowrap uppercase sm:gap-5"
              >
                <span className="flex items-center py-2 text-term-muted">Problems</span>
                <span className="flex items-center py-2 text-term-muted">Output</span>
                <span className="flex items-center py-2 text-term-muted">Debug Console</span>
                <span className="-mb-px flex items-center border-b border-term-accent py-2 text-term-fg">
                  Terminal
                </span>
              </div>

              <div className="p-5 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <span className="select-none text-term-green">$</span>
                  <span className="flex items-center whitespace-pre text-term-fg">
                    {active.command}
                    <span className="ml-1.5 h-4 w-2 animate-[cli-step-cursor_1.1s_step-end_infinite] bg-term-fg" />
                  </span>
                </div>
                <div className="mt-2 whitespace-pre text-term-muted">{active.output}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => goTo(activeIndex - 1)}
                aria-label="Previous step"
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={replay}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <ReplayIcon className="h-3.5 w-3.5" />
                replay
              </button>
              <button
                type="button"
                onClick={() => goTo(activeIndex + 1)}
                aria-label="Next step"
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
