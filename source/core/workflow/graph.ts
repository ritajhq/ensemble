import type { Workflow } from "./schema.ts";

export class WorkflowCycleError extends Error {}

/**
 * Builds topological batches of job ids from a workflow's `needs` edges.
 * Each batch is a list of job ids whose dependencies are all satisfied by
 * previous batches, and are therefore safe to run concurrently.
 */
export function buildBatches(workflow: Workflow): string[][] {
  const jobIds = Object.keys(workflow.jobs);
  const remainingDeps = new Map<string, Set<string>>();
  for (const jobId of jobIds) {
    remainingDeps.set(jobId, new Set(workflow.jobs[jobId].needs ?? []));
  }

  const batches: string[][] = [];
  const done = new Set<string>();

  while (done.size < jobIds.length) {
    const batch = jobIds.filter((id) =>
      !done.has(id) && [...remainingDeps.get(id)!].every((dep) => done.has(dep))
    );

    if (batch.length === 0) {
      const remaining = jobIds.filter((id) => !done.has(id));
      throw new WorkflowCycleError(
        `Cycle detected among jobs: ${remaining.join(", ")}`,
      );
    }

    batches.push(batch);
    for (const id of batch) done.add(id);
  }

  return batches;
}

/** Returns the set of job ids that `jobId` transitively depends on (not including itself). */
export function transitiveDeps(workflow: Workflow, jobId: string): Set<string> {
  const result = new Set<string>();
  const stack = [...(workflow.jobs[jobId]?.needs ?? [])];
  while (stack.length > 0) {
    const dep = stack.pop()!;
    if (result.has(dep)) continue;
    result.add(dep);
    stack.push(...(workflow.jobs[dep]?.needs ?? []));
  }
  return result;
}
