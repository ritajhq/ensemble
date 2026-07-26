import type { JobResult, StepResult } from "./context.ts";

export interface SummaryRow {
  jobId: string;
  result: JobResult;
  durationMs: number;
}

/**
 * Emits clearly delimited start/end markers around each job's and step's
 * output, so a later UI can stream stdout and reconstruct a flow diagram of
 * the running workflow from the markers alone. Steps run their commands with
 * stdout/stderr inherited (see run-step.ts), so a step's raw output always
 * lands between its own "step started" and "step <result>" marker lines —
 * nothing is buffered or reordered.
 */
export class JobLogger {
  private startedAt = performance.now();

  constructor(private readonly jobId: string) {
    console.log(`=== job:${this.jobId} started ===`);
  }

  stepStart(label: string) {
    console.log(`--- step:${this.jobId}/${label} started ---`);
  }

  stepEnd(label: string, result: StepResult, durationMs: number, continuedOnError = false) {
    const suffix = continuedOnError ? " (continue-on-error)" : "";
    console.log(
      `--- step:${this.jobId}/${label} ${result} (${durationMs.toFixed(0)}ms)${suffix} ---`,
    );
  }

  info(message: string) {
    console.log(`[${this.jobId}] ${message}`);
  }

  /** Logs this job's final result and returns its duration. */
  flush(result: JobResult): number {
    const durationMs = performance.now() - this.startedAt;
    console.log(`=== job:${this.jobId} ${result} (${durationMs.toFixed(0)}ms) ===`);
    return durationMs;
  }
}

/** Prints a final job -> result -> duration summary table. */
export function printSummary(rows: SummaryRow[]) {
  console.log("\n=== summary ===");
  const jobWidth = Math.max(3, ...rows.map((r) => r.jobId.length));
  const resultWidth = Math.max(6, ...rows.map((r) => r.result.length));
  for (const row of rows) {
    console.log(
      `${row.jobId.padEnd(jobWidth)}  ${row.result.padEnd(resultWidth)}  ${
        row.durationMs.toFixed(0)
      }ms`,
    );
  }
}
