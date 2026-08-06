import { assertEquals } from "@std/assert";
import { emitWorkflowEvent, isEventLine, parseEventLine } from "./event-log.ts";
import type { WorkflowEvent } from "./run-workflow.ts";

function captureStdout(fn: () => void): string {
  const original = console.log;
  let captured = "";
  console.log = (msg: string) => {
    captured = msg;
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return captured;
}

Deno.test("event-log: emitWorkflowEvent/isEventLine/parseEventLine round-trip", () => {
  const event: WorkflowEvent = { type: "job-started", jobId: "build" };
  const line = captureStdout(() => emitWorkflowEvent(event));

  assertEquals(isEventLine(line), true);
  assertEquals(parseEventLine(line), event);
});

Deno.test("event-log: isEventLine rejects ordinary log lines", () => {
  assertEquals(isEventLine("hello from a step"), false);
  assertEquals(isEventLine("=== job:build started ==="), false);
  assertEquals(isEventLine(""), false);
});

Deno.test("event-log: round-trips a step-finished event with an embedded log", () => {
  const event: WorkflowEvent = {
    type: "step-finished",
    jobId: "build",
    index: 0,
    label: "compile",
    result: "success",
    durationMs: 42,
    continuedOnError: false,
    log: { stdout: "hi\n", stderr: "", truncated: false },
  };
  const line = captureStdout(() => emitWorkflowEvent(event));

  assertEquals(isEventLine(line), true);
  assertEquals(parseEventLine(line), event);
});
