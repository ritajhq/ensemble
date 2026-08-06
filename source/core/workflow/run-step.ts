import { isAbsolute, resolve } from "@std/path";
import { RealEnvironment, which } from "@david/which";
import bootstrapSource from "./run-script-subprocess.ts" with { type: "text" };
import type { Step } from "./schema.ts";
import type { JobContext, StepResult } from "./context.ts";
import { evaluateStepIf, interpolateStep, toStepContext } from "./context.ts";
import { WorkflowExpressionError } from "./expressions.ts";
import { type ResultChannel, TempFileResultChannel } from "./result-channel.ts";

const resultChannel: ResultChannel = new TempFileResultChannel();

/** A step's captured stdout/stderr, bounded so it fits comfortably under Deno KV's per-value size limit. */
export interface StepLogCapture {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export interface StepRunResult {
  result: StepResult;
  outputs: Record<string, string>;
  /** True when the step failed but had continue-on-error: true set. */
  continuedOnError: boolean;
  log: StepLogCapture;
}

/** A step's hard failure (no continue-on-error), carrying its captured log so the caller can still surface it. */
export class StepRunError extends Error {
  constructor(message: string, readonly log: StepLogCapture) {
    super(message);
  }
}

let cachedDenoExe: string | undefined;

/**
 * Resolves the real `deno` executable on PATH, not `Deno.execPath()` — under
 * a `deno compile`d binary, `Deno.execPath()` points at that binary itself,
 * so spawning it as "deno" would silently re-invoke the compiled program.
 */
async function resolveDenoExecutable(): Promise<string> {
  if (!cachedDenoExe) {
    const found = await which("deno", new RealEnvironment());
    if (!found) {
      throw new Error("Could not locate the `deno` executable on PATH.");
    }
    cachedDenoExe = found;
  }
  return cachedDenoExe;
}

let cachedBootstrapPath: Promise<string> | undefined;

/**
 * Materializes the subprocess bootstrap's embedded source to a real temp
 * file on first use, so it can be `deno run` as an actual subprocess even
 * when @ensemble/workflow itself is embedded in a `deno compile`d binary
 * (whose own `import.meta.url` doesn't correspond to a real on-disk path).
 */
function getBootstrapPath(): Promise<string> {
  if (!cachedBootstrapPath) {
    cachedBootstrapPath = (async () => {
      const path = await Deno.makeTempFile({ suffix: ".ts" });
      await Deno.writeTextFile(path, bootstrapSource);
      return path;
    })();
  }
  return cachedBootstrapPath;
}

function isOutputRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === "string");
}

/**
 * Parses `$WORKFLOW_OUTPUT`-style content: one `key=value` pair per non-blank
 * line, mirroring GitHub Actions' `$GITHUB_OUTPUT` file convention. Blank
 * lines are skipped; a line with no `=` or a blank key is ignored rather than
 * throwing, since malformed output shouldn't fail an otherwise-successful step.
 */
function parseOutputFile(text: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    outputs[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return outputs;
}

// A sanity ceiling against a runaway/infinite-output step, not a limit tied
// to Deno KV's per-value size — persistence chunks the capture into
// KV-sized pieces separately (see runs.ts putStepLog), so this can stay
// generous.
const MAX_CAPTURED_BYTES_PER_STREAM = 5 * 1024 * 1024;

/**
 * Reads `stream` to completion, mirroring every chunk to `mirror` (the real
 * stdout/stderr) so a human tailing this process live sees no change, while
 * also accumulating up to `MAX_CAPTURED_BYTES_PER_STREAM` bytes for capture.
 * Draining continues past the cap (dropping further bytes from the capture
 * only) so the child's pipe never backs up and deadlocks it.
 */
async function pumpAndCapture(
  stream: ReadableStream<Uint8Array>,
  mirror: { write(p: Uint8Array): Promise<number> | number },
): Promise<{ text: string; truncated: boolean }> {
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let capturedBytes = 0;
  let truncated = false;

  for await (const chunk of stream) {
    await mirror.write(chunk);
    if (capturedBytes < MAX_CAPTURED_BYTES_PER_STREAM) {
      const remaining = MAX_CAPTURED_BYTES_PER_STREAM - capturedBytes;
      const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(slice);
      capturedBytes += slice.length;
      if (chunk.length > remaining) truncated = true;
    } else {
      truncated = true;
    }
  }

  const combined = new Uint8Array(capturedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return { text: decoder.decode(combined), truncated };
}

async function runShell(
  command: string,
  cwd: string,
  variables: Record<string, string>,
  signal: AbortSignal,
): Promise<{ code: number; outputs: Record<string, string>; log: StepLogCapture }> {
  const outputHandle = await resultChannel.create();
  try {
    const cmd = new Deno.Command(Deno.build.os === "windows" ? "cmd" : "/bin/sh", {
      args: Deno.build.os === "windows" ? ["/c", command] : ["-c", command],
      cwd,
      env: { ...variables, WORKFLOW_OUTPUT: outputHandle },
      stdout: "piped",
      stderr: "piped",
      signal,
    });
    const child = cmd.spawn();

    const [stdout, stderr, status] = await Promise.all([
      pumpAndCapture(child.stdout, Deno.stdout),
      pumpAndCapture(child.stderr, Deno.stderr),
      child.status,
    ]);

    const outputs = parseOutputFile(await resultChannel.read(outputHandle));

    return {
      code: status.code,
      outputs,
      log: { stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated },
    };
  } finally {
    await resultChannel.cleanup(outputHandle);
  }
}

/**
 * Runs a `script:` step as a subprocess: `ctx` (plain data — no functions)
 * is fed via stdin, and the user's script's `run(ctx)` return value comes
 * back through a ResultChannel (a temp file, by default) — NOT stdout,
 * which stays inherited so the script's own console.log/console.error still
 * appear live in the job's log block, exactly like an in-process step.
 * Running as a subprocess (rather than an in-process dynamic import, as
 * before) is what makes fail-fast's cancellation of an in-flight sibling
 * instance genuinely effective — `signal` actually kills the process, unlike
 * an awaited in-process function call.
 */
async function runScript(
  scriptPath: string,
  workflowDir: string,
  cwd: string,
  ctx: JobContext,
  signal: AbortSignal,
): Promise<{ outputs: Record<string, string>; log: StepLogCapture }> {
  const absPath = isAbsolute(scriptPath) ? scriptPath : resolve(workflowDir, scriptPath);
  const [denoExe, bootstrapPath, resultHandle] = await Promise.all([
    resolveDenoExecutable(),
    getBootstrapPath(),
    resultChannel.create(),
  ]);

  try {
    const cmd = new Deno.Command(denoExe, {
      args: ["run", "-A", "-q", bootstrapPath, absPath, resultHandle],
      cwd,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      signal,
    });
    const child = cmd.spawn();

    const stepContext = toStepContext(ctx);
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(stepContext)));
    await writer.close();

    const [stdout, stderr, status] = await Promise.all([
      pumpAndCapture(child.stdout, Deno.stdout),
      pumpAndCapture(child.stderr, Deno.stderr),
      child.status,
    ]);
    const log: StepLogCapture = { stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated };

    if (status.code !== 0) {
      throw new StepRunError(`Script "${scriptPath}" exited with code ${status.code}.`, log);
    }

    const resultText = (await resultChannel.read(resultHandle)).trim();
    if (resultText === "") return { outputs: {}, log };
    const outputs = JSON.parse(resultText);
    if (!isOutputRecord(outputs)) {
      throw new StepRunError(`Script "${scriptPath}"'s run() must return Record<string,string> or void.`, log);
    }
    return { outputs, log };
  } finally {
    await resultChannel.cleanup(resultHandle);
  }
}

/**
 * Resolves a step's effective cwd: `in: { repository: <name> }` points it at
 * that resources.repositories entry's checkout instead of the run's scratch
 * directory. `name` must be a key in `ctx.repositories` — i.e. actually
 * declared under the workflow's `resources.repositories`.
 */
function resolveStepCwd(step: Step, defaultCwd: string, ctx: JobContext): string {
  if (step.in === undefined) return defaultCwd;
  const repo = ctx.repositories?.[step.in.repository];
  if (repo === undefined) {
    throw new WorkflowExpressionError(
      `Step's "in.repository" references "${step.in.repository}", which isn't declared under resources.repositories.`,
    );
  }
  return repo.path;
}

/**
 * Executes a single step: evaluates `if:`, dispatches to run:/script:, and applies continue-on-error.
 * `cwd` is the run's own scratch directory (fresh per workflow run) — distinct from `workflowDir`,
 * which is only ever used to resolve a `script:` step's path on disk. A step's own `in:` can override
 * this default (see resolveStepCwd).
 */
export async function runStep(
  step: Step,
  workflowDir: string,
  cwd: string,
  ctx: JobContext,
  signal: AbortSignal = new AbortController().signal,
): Promise<StepRunResult> {
  if (step.if !== undefined && !evaluateStepIf(step.if, ctx)) {
    return { result: "skipped", outputs: {}, continuedOnError: false, log: { stdout: "", stderr: "", truncated: false } };
  }

  const effectiveCwd = resolveStepCwd(step, cwd, ctx);
  let capturedLog: StepLogCapture = { stdout: "", stderr: "", truncated: false };

  try {
    let outputs: Record<string, string> = {};
    if (step.run !== undefined) {
      const command = interpolateStep(step.run, ctx);
      const shellResult = await runShell(command, effectiveCwd, ctx.variables, signal);
      capturedLog = shellResult.log;
      if (shellResult.code !== 0) {
        throw new StepRunError(`Command exited with code ${shellResult.code}: ${command}`, capturedLog);
      }
      outputs = shellResult.outputs;
    } else {
      const scriptResult = await runScript(step.script!, workflowDir, effectiveCwd, ctx, signal);
      capturedLog = scriptResult.log;
      outputs = scriptResult.outputs;
    }
    return { result: "success", outputs, continuedOnError: false, log: capturedLog };
  } catch (error) {
    if (error instanceof WorkflowExpressionError) throw error;
    const log = error instanceof StepRunError ? error.log : capturedLog;
    if (step["continue-on-error"]) {
      return { result: "failure", outputs: {}, continuedOnError: true, log };
    }
    throw error instanceof StepRunError ? error : new StepRunError(error instanceof Error ? error.message : String(error), log);
  }
}
