import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Executable } from "vscode-languageclient/node";
import type * as Status from "./status.ts";

const run = promisify(execFile);

/** Where `.ensemble/install.sh` puts `ens` by default. */
const INSTALLER_DEFAULT = join(homedir(), ".ensemble", "bin", "ens");
const VERSION = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/;
/** `ens` colours its output for people; programs reading it want plain text (https://no-color.org). */
const PLAIN = { ...process.env, NO_COLOR: "1" };

/** The `ens` binary, invoked as a child process from the project root. */
export class Cli {
  constructor(
    readonly executable: string,
    private readonly projectRoot: string | undefined,
  ) {}

  /**
   * Finds `ens`: an explicitly configured path first, then the installer's
   * default location, then plain `ens` on the PATH. The default location
   * matters because an editor launched from the desktop doesn't read the
   * shell profile that puts `~/.ensemble/bin` on the PATH.
   */
  static locate(configured: string | undefined, projectRoot: string | undefined): Cli {
    if (configured) return new Cli(configured, projectRoot);
    if (existsSync(INSTALLER_DEFAULT)) return new Cli(INSTALLER_DEFAULT, projectRoot);
    return new Cli(Cli.onPath("ens") ?? "ens", projectRoot);
  }

  /** The full path `name` resolves to on the PATH — so there is a file to watch for updates — or undefined when it isn't there. */
  private static onPath(name: string): string | undefined {
    const dirs = (process.env.PATH ?? "").split(delimiter).filter((dir) => dir.length > 0);
    return dirs.map((dir) => join(dir, name)).find((path) => existsSync(path));
  }

  /** The installed `ens`'s version (e.g. "0.37.0"), or undefined when it can't be run. */
  async version(): Promise<string | undefined> {
    try {
      const { stdout } = await run(this.executable, ["--version"], { env: PLAIN });
      return VERSION.exec(stdout)?.[0];
    } catch {
      return undefined;
    }
  }

  /** Everything the project declares, from `ens status --json`. */
  async status(): Promise<Status.Document> {
    const { stdout } = await run(this.executable, ["status", "--json"], { cwd: this.projectRoot, env: PLAIN, maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  }

  /** How to launch `ens lsp`, for a language client to own the process. */
  languageServer(): Executable {
    return { command: this.executable, args: ["lsp", "--stdio"], options: { cwd: this.projectRoot, env: PLAIN } };
  }
}
