/** `cwd`/`env`/`signal` for a `ProcessRunner` call — the same shape across `run`/`exec`/`capture`. */
export interface ProcessRunOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  /** Aborting this kills the spawned process (SIGTERM) — used by a long-running `--watch` invocation to tear its kit subprocess down. */
  readonly signal?: AbortSignal;
}

/**
 * What ens's orchestration needs from the machine to run an external
 * command — a build/pack/publish kit's subprocess, a git operation, an `sh
 * -c` hook — without depending on how that's actually carried out (dax, raw
 * `Deno.Command`, …). Core only ever sees this port; the concrete
 * implementation lives in `@ensemble/host`.
 */
export interface ProcessRunner {
  /** Runs to completion with stdio inherited, returning the exit code. Never throws on a non-zero exit — the caller decides what that means (e.g. a kit's own exit code is the caller's business outcome, not a failure of `run` itself). */
  run(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<number>;
  /** Runs to completion with stdio inherited and no output captured, throwing on a non-zero exit. */
  exec(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<void>;
  /** Runs to completion, capturing and returning trimmed stdout instead of inheriting it, throwing on a non-zero exit. */
  capture(
    command: string,
    args: readonly string[],
    options?: ProcessRunOptions,
  ): Promise<string>;
}

/** Locates the repository root `ens` is operating in. */
export interface RepoLocator {
  findRepoRoot(): Promise<string>;
}

/** Resolves the real `deno` executable to spawn kit subprocesses with — distinct from `Deno.execPath()` once `ens` itself is `deno compile`d. */
export interface DenoExecutableResolver {
  resolveDenoExecutable(): Promise<string>;
}

/**
 * The machine-facing capabilities ens's orchestration needs, bundled for
 * convenient injection into a `runX` free function or a class constructor.
 * Implemented by `@ensemble/host`'s `createPorts()` — core never constructs
 * one itself.
 */
export interface Ports {
  readonly repo: RepoLocator;
  readonly denoExe: DenoExecutableResolver;
  readonly process: ProcessRunner;
}
