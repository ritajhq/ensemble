import type { DeployWork, PreviewWork, ReleaseWork, Work } from "./api.ts";

/** How each kind of work reads, as a run's title and the details beside it. */
const KINDS: {
  readonly [K in Work["kind"]]: {
    title(work: Extract<Work, { kind: K }>): string;
    details(work: Extract<Work, { kind: K }>): readonly string[];
  };
} = {
  deploy: {
    title: (work: DeployWork) =>
      `${
        work.termination === "plan" ? "Plan" : "Deploy"
      } ${work.manifest} → ${work.environment}`,
    details: (work: DeployWork) => [work.kit, work.version],
  },
  release: {
    title: (work: ReleaseWork) => `Release ${work.project}`,
    details: (work: ReleaseWork) => [`${work.action} ${work.argument}`],
  },
  preview: {
    title: (work: PreviewWork) =>
      `${
        work.intent === "deploy" ? "Preview" : "Take down preview of"
      } ${work.manifest} ← ${work.branch}`,
    details: (work: PreviewWork) => [work.kit],
  },
};

export function titleOf(work: Work): string {
  return (KINDS[work.kind].title as (work: Work) => string)(work);
}

export function detailsOf(work: Work): readonly string[] {
  return (KINDS[work.kind].details as (work: Work) => readonly string[])(work);
}
