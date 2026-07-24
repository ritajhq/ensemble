import type { JobResult, StepResult } from "./context.ts";

interface StepLogEntry {
  label: string;
  result: StepResult;
  durationMs: number;
  continuedOnError: boolean;
}

/** Buffers a single job's log lines so parallel jobs don't interleave line-by-line. */
export class JobLogger {
  private lines: string[] = [];
  private steps: StepLogEntry[] = [];
  private startedAt = performance.now();

  constructor(private readonly jobId: string) {
    this.lines.push(`\n=== job:${jobId} started ===`);
  }

  stepStart(label: string) {
    this.lines.push(`[${this.jobId}/${label}] start`);
  }

  stepEnd(label: string, result: StepResult, durationMs: number, continuedOnError = false) {
    const suffix = continuedOnError ? " (continue-on-error)" : "";
    this.lines.push(
      `[${this.jobId}/${label}] ${result} (${durationMs.toFixed(0)}ms)${suffix}`,
    );
    this.steps.push({ label, result, durationMs, continuedOnError });
  }

  info(message: string) {
    this.lines.push(`[${this.jobId}] ${message}`);
  }

  /** Flushes the buffered lines for this job as one labeled block, and returns its duration. */
  flush(result: JobResult): number {
    const durationMs = performance.now() - this.startedAt;
    this.lines.push(`=== job:${this.jobId} ${result} (${durationMs.toFixed(0)}ms) ===`);
    console.log(this.lines.join("\n"));
    return durationMs;
  }
}

export interface SummaryRow {
  jobId: string;
  result: JobResult;
  durationMs: number;
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
