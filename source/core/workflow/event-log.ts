import type { WorkflowEvent } from "./run-workflow.ts";

/**
 * Marks a structured WorkflowEvent line among a container's otherwise
 * free-form stdout (step logs, console output). NUL bytes don't survive
 * reliably through console.log/pipes/terminals, so this uses an ordinary but
 * distinctive text token instead — one no shell script or console.log of a
 * step's own output is going to produce by coincidence.
 */
const EVENT_PREFIX = "##ENSEMBLE-EVENT## ";

/** Emits `event` as a single structured line on stdout, alongside ordinary human-readable log lines. */
export function emitWorkflowEvent(event: WorkflowEvent): void {
  console.log(EVENT_PREFIX + JSON.stringify(event));
}

/** True if `line` is a structured event line rather than ordinary mirrored step output. */
export function isEventLine(line: string): boolean {
  return line.startsWith(EVENT_PREFIX);
}

/** Parses a line already confirmed via isEventLine into its WorkflowEvent. */
export function parseEventLine(line: string): WorkflowEvent {
  return JSON.parse(line.slice(EVENT_PREFIX.length));
}
