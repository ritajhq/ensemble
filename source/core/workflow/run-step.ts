import { isAbsolute, resolve } from "@std/path";
import { RealEnvironment, which } from "@david/which";
import bootstrapSource from "./run-script-subprocess.ts" with { type: "text" };
import type { Step } from "./schema.ts";
import type { JobContext, StepResult } from "./context.ts";
import { evaluateStepIf, toStepContext } from "./context.ts";
import { WorkflowExpressionError } from "./expressions.ts";
import { type ResultChannel, TempFileResultChannel } from "./result-channel.ts";

const resultChannel: ResultChannel = new TempFileResultChannel();

export interface StepRunResult {
  result: StepResult;
  outputs: Record<string, string>;
  /** True when the step failed but had continue-on-error: true set. */
  continuedOnError: boolean;
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

async function runShell(
  command: string,
  cwd: string,
  variables: Record<string, string>,
  signal: AbortSignal,
): Promise<number> {
  const cmd = new Deno.Command(Deno.build.os === "windows" ? "cmd" : "/bin/sh", {
    args: Deno.build.os === "windows" ? ["/c", command] : ["-c", command],
    cwd,
    env: variables,
    stdout: "inherit",
    stderr: "inherit",
    signal,
  });
  const { code } = await cmd.output();
  return code;
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
): Promise<Record<string, string>> {
  const absPath = isAbsolute(scriptPath) ? scriptPath : resolve(workflowDir, scriptPath);
  const [denoExe, bootstrapPath, resultHandle] = await Promise.all([
    resolveDenoExecutable(),
    getBootstrapPath(),
    resultChannel.create(),
  ]);

  try {
    const cmd = new Deno.Command(denoExe, {
      args: ["run", "-A", bootstrapPath, absPath, resultHandle],
      cwd,
      stdin: "piped",
      stdout: "inherit",
      stderr: "inherit",
      signal,
    });
    const child = cmd.spawn();

    const stepContext = toStepContext(ctx);
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(stepContext)));
    await writer.close();

    const { code } = await child.output();
    if (code !== 0) {
      throw new Error(`Script "${scriptPath}" exited with code ${code}.`);
    }

    const resultText = (await resultChannel.read(resultHandle)).trim();
    if (resultText === "") return {};
    const outputs = JSON.parse(resultText);
    if (!isOutputRecord(outputs)) {
      throw new Error(`Script "${scriptPath}"'s run() must return Record<string,string> or void.`);
    }
    return outputs;
  } finally {
    await resultChannel.cleanup(resultHandle);
  }
}

/**
 * Executes a single step: evaluates `if:`, dispatches to run:/script:, and applies continue-on-error.
 * `cwd` is the run's own scratch directory (fresh per workflow run) — distinct from `workflowDir`,
 * which is only ever used to resolve a `script:` step's path on disk.
 */
export async function runStep(
  step: Step,
  workflowDir: string,
  cwd: string,
  ctx: JobContext,
  signal: AbortSignal = new AbortController().signal,
): Promise<StepRunResult> {
  if (step.if !== undefined && !evaluateStepIf(step.if, ctx)) {
    return { result: "skipped", outputs: {}, continuedOnError: false };
  }

  try {
    let outputs: Record<string, string> = {};
    if (step.run !== undefined) {
      const code = await runShell(step.run, cwd, ctx.variables, signal);
      if (code !== 0) {
        throw new Error(`Command exited with code ${code}: ${step.run}`);
      }
    } else {
      outputs = await runScript(step.script!, workflowDir, cwd, ctx, signal);
    }
    return { result: "success", outputs, continuedOnError: false };
  } catch (error) {
    if (error instanceof WorkflowExpressionError) throw error;
    if (step["continue-on-error"]) {
      return { result: "failure", outputs: {}, continuedOnError: true };
    }
    throw error;
  }
}
