import type { ProcessRunner, ProcessRunOptions } from "@ensemble/core";

interface RunResult {
  readonly code: number;
  readonly stdout: string;
}

async function spawn(
  command: string,
  args: readonly string[],
  options: ProcessRunOptions | undefined,
  capture: boolean,
): Promise<RunResult> {
  const child = new Deno.Command(command, {
    args: [...args],
    cwd: options?.cwd,
    env: options?.env,
    stdout: capture ? "piped" : "inherit",
    stderr: "inherit",
  }).spawn();

  const signal = options?.signal;
  const kill = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // Already exited on its own — nothing to tear down.
    }
  };
  if (signal) {
    if (signal.aborted) kill();
    else signal.addEventListener("abort", kill, { once: true });
  }

  try {
    if (capture) {
      const output = await child.output();
      return { code: output.code, stdout: new TextDecoder().decode(output.stdout).trim() };
    }
    const status = await child.status;
    return { code: status.code, stdout: "" };
  } finally {
    signal?.removeEventListener("abort", kill);
  }
}

function commandLine(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

/**
 * The real `ProcessRunner`: spawns via raw `Deno.Command`, the same
 * primitive `@ensemble/core`'s own `deploy/terminations` classes
 * (`Applier`, `WatchRunner`, `ExternalsEmulator`) already use without dax —
 * no templated shell-quoting concerns here since `command`/`args` are
 * always already-split argv, never a shell string.
 */
export class NativeProcessRunner implements ProcessRunner {
  async run(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<number> {
    const { code } = await spawn(command, args, options, false);
    return code;
  }

  async exec(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<void> {
    const { code } = await spawn(command, args, options, false);
    if (code !== 0) {
      throw new Error(`Command "${commandLine(command, args)}" failed with exit code ${code}.`);
    }
  }

  async capture(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<string> {
    const { code, stdout } = await spawn(command, args, options, true);
    if (code !== 0) {
      throw new Error(`Command "${commandLine(command, args)}" failed with exit code ${code}.`);
    }
    return stdout;
  }
}
