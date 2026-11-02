import type { BuildNeed, EnsembleConfig } from "./config.ts";

/** One of the two things `ens` can run for an app or ship. */
export interface Step {
  readonly kind: "build" | "pack";
  readonly name: string;
}

function describe(step: Step): string {
  return `${step.kind} ${step.name}`;
}

function stepFrom(need: BuildNeed): Step {
  if (typeof need === "string") return { kind: "build", name: need };
  if ("pack" in need) return { kind: "pack", name: need.pack };
  return { kind: "build", name: need.build };
}

/** What `.ensemble/config.yaml` says each build and pack needs finished first. */
export class Needs {
  constructor(private readonly config: EnsembleConfig) {}

  /** What `step` declares directly, whose outputs its kit gets told about. */
  of(step: Step): Step[] {
    const section = step.kind === "build"
      ? this.config.build?.[step.name]
      : this.config.pack?.[step.name];
    return (section?.needs ?? []).map(stepFrom);
  }

  /** Everything that has to finish before `step`, deepest first and each once, without `step` itself. */
  prerequisitesOf(step: Step): Step[] {
    const ordered: Step[] = [];
    const visit = (current: Step, path: readonly Step[]): void => {
      for (const need of this.of(current)) {
        if (path.some((seen) => Needs.same(seen, need))) {
          throw new Error(
            `Needs form a cycle: ${
              [...path, need].map(describe).join(" -> ")
            }.`,
          );
        }
        visit(need, [...path, need]);
        if (!ordered.some((seen) => Needs.same(seen, need))) ordered.push(need);
      }
    };
    visit(step, [step]);
    return ordered;
  }

  private static same(a: Step, b: Step): boolean {
    return a.kind === b.kind && a.name === b.name;
  }
}
