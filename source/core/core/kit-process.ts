import { basename, dirname, join, relative } from "@std/path";
import * as KitManifest from "./vendor/kit-manifest.ts";
import {
  CommandFailure,
  type Ports,
  type ProbeResult,
  type ProcessRunOptions,
} from "./ports.ts";

/** `ProcessRunOptions` without `cwd`: a kit always runs from its own directory, so it resolves its own dependencies. */
export type KitRunOptions = Omit<ProcessRunOptions, "cwd">;

/** A kit failed: the kit has told the person why on its own stderr, so this says only which one and how. `detail` is for `ENS_DEBUG`. */
export class KitFailure extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "KitFailure";
  }
}

/**
 * Loaded ahead of every kit, so that an error it doesn't catch reads as its
 * message and not as Deno's account of a crash, whatever the kit is and without
 * taking the terminal from what it runs, which piping its stderr would. Exits
 * with the 1 an uncaught error exits with anyway. `ENS_DEBUG` leaves Deno's
 * own report in place, stack included.
 */
const UNCAUGHT_ERROR_REPORT = `
if (!Deno.env.get("ENS_DEBUG")) {
  const report = (event, error) => {
    event.preventDefault();
    const message = error instanceof Error ? error.message : String(error);
    const color = Deno.stderr.isTerminal() && !Deno.noColor;
    console.error(color ? "\\x1b[31merror: " + message + "\\x1b[39m" : "error: " + message);
    Deno.exit(1);
  };
  addEventListener("unhandledrejection", (event) => report(event, event.reason));
  addEventListener("error", (event) => report(event, event.error));
}
`;
const UNCAUGHT_ERROR_REPORT_URL = `data:text/javascript;base64,${
  btoa(UNCAUGHT_ERROR_REPORT)
}`;

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
    try {
      return await this.ports.process.capture(command, commandArgs, {
        ...options,
        cwd: this.directory,
      });
    } catch (error) {
      if (!(error instanceof CommandFailure)) throw error;
      throw new KitFailure(
        `Kit "${
          basename(this.directory)
        }" failed with exit code ${error.code}.`,
        error.code,
        error.message,
      );
    }
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
      "--preload",
      UNCAUGHT_ERROR_REPORT_URL,
      ...await this.configArgs(),
      join(this.directory, entrypoint),
      ...args,
    ];
  }

  /**
   * The project's generated Deno config, when it covers this kit. A kit it
   * doesn't cover, because the project has no Deno ecosystem or the kit arrived
   * after the last sync, resolves through its own `deno.json` instead.
   */
  private async configArgs(): Promise<string[]> {
    const config = join(
      this.directory,
      "..",
      "..",
      "..",
      "ecosystems",
      "deno",
      "deno.json",
    );
    let scopes: Record<string, unknown>;
    try {
      scopes = JSON.parse(await Deno.readTextFile(config)).scopes ?? {};
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return [];
      throw error;
    }
    const scope = `${relative(dirname(config), this.directory)}/`;
    return Object.hasOwn(scopes, scope) ? ["--config", config] : [];
  }
}
