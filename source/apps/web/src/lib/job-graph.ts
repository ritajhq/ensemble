import type { RunJobNode } from "./api.ts";

export interface JobGraphNode {
  id: string;
  needs: string[];
  /** Dependency-order column — every job in `needs` is in an earlier column. */
  column: number;
  /** Position within its column, top to bottom. */
  row: number;
}

/**
 * Topologically batches jobs into columns from their `needs` edges — same
 * algorithm as the workflow engine's own buildBatches, run client-side over
 * the job list a run already reports, so column position always matches how
 * the engine actually schedules jobs into concurrent batches.
 */
export function layoutJobGraph(jobs: RunJobNode[]): JobGraphNode[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const remainingDeps = new Map(jobs.map((job) => [job.id, new Set(job.needs.filter((id) => byId.has(id)))]));

  const done = new Set<string>();
  const result: JobGraphNode[] = [];
  let column = 0;

  while (done.size < jobs.length) {
    const batch = jobs.filter((job) => !done.has(job.id) && [...remainingDeps.get(job.id)!].every((dep) => done.has(dep)));
    if (batch.length === 0) {
      // A cycle or a dangling `needs` reference — place whatever's left in one final column rather than looping forever.
      for (const job of jobs) {
        if (!done.has(job.id)) result.push({ id: job.id, needs: job.needs, column, row: result.length });
      }
      break;
    }
    batch.forEach((job, row) => {
      result.push({ id: job.id, needs: job.needs, column, row });
      done.add(job.id);
    });
    column += 1;
  }

  return result;
}
