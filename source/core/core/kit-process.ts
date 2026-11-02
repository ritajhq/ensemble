import { join } from "@std/path";
import * as KitManifest from "./vendor/kit-manifest.ts";
import type { Ports, ProbeResult, ProcessRunOptions } from "./ports.ts";

/** `ProcessRunOptions` without `cwd`: a kit always runs from its own directory, so it resolves its own dependencies. */
export type KitRunOptions = Omit<ProcessRunOptions, "cwd">;

/**
 * The one place that knows how a kit's entrypoint gets launched. Every kit
 * role goes through here, whatever contract its arguments speak.
 */
export class KitProcess {
  constructor(
    private readonly directory: string,
    private readonly ports: Pick<Ports, "denoExe" | "process">,
  ) {}

  /** Runs `entrypoint` with stdio inherited, returning the kit's exit code. */
  async run(
    entrypoint: string,
    args: readonly string[],
    options: KitRunOptions = {},
  ): Promise<number> {
    const [command, ...commandArgs] = await this.commandLine(entrypoint, args);
    return await this.ports.process.run(command, commandArgs, {
      ...options,
      cwd: this.directory,
    });
  }

  /** Runs `entrypoint`, returning what it printed, and throws if it fails. */
  async capture(
    entrypoint: string,
    args: readonly string[],
    options: KitRunOptions = {},
  ): Promise<string> {
    const [command, ...commandArgs] = await this.commandLine(entrypoint, args);
    return await this.ports.process.capture(command, commandArgs, {
      ...options,
      cwd: this.directory,
    });
  }

  /** Runs `entrypoint` as a check: its exit code is the verdict, its stderr the reason. */
  async probe(
    entrypoint: string,
    args: readonly string[],
    options: KitRunOptions = {},
  ): Promise<ProbeResult> {
    const [command, ...commandArgs] = await this.commandLine(entrypoint, args);
    return await this.ports.process.probe(command, commandArgs, {
      ...options,
      cwd: this.directory,
    });
  }

  /**
   * The full command that launches `entrypoint`, for a caller that has to
   * manage the process's stdio itself. It must run from this kit's directory.
   *
   * --minimum-dependency-age 0: kits depend on `@ensemble` and `@duesabati`
   * first-party packages, which Deno's default 24h minimum dependency age (a
   * supply-chain mitigation aimed at unfamiliar third-party deps) would
   * otherwise block from resolving right after a fresh release — scoped to
   * just this invocation, not the user's own project-wide deno.json policy.
   */
  async commandLine(
    entrypoint: string,
    args: readonly string[],
  ): Promise<[string, ...string[]]> {
    await KitManifest.assertRunnable(this.directory);
    return [
      await this.ports.denoExe.resolveDenoExecutable(),
      "run",
      "-A",
      "-q",
      "--minimum-dependency-age",
      "0",
      join(this.directory, entrypoint),
      ...args,
    ];
  }
}
