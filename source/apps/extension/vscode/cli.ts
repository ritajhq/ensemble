import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Executable } from "vscode-languageclient/node";
import type * as Status from "./status.ts";

const run = promisify(execFile);

/** Where `.ensemble/install.sh` puts `ens` by default. */
const INSTALLER_DEFAULT = join(homedir(), ".ensemble", "bin", "ens");
const VERSION = /\d+\.\d+\.\d+\S*/;

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
    return new Cli("ens", projectRoot);
  }

  /** The installed `ens`'s version (e.g. "0.37.0"), or undefined when it can't be run. */
  async version(): Promise<string | undefined> {
    try {
      const { stdout } = await run(this.executable, ["--version"]);
      return VERSION.exec(stdout)?.[0];
    } catch {
      return undefined;
    }
  }

  /** Everything the project declares, from `ens status --json`. */
  async status(): Promise<Status.Document> {
    const { stdout } = await run(this.executable, ["status", "--json"], { cwd: this.projectRoot, maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  }

  /** How to launch `ens lsp`, for a language client to own the process. */
  languageServer(): Executable {
    return { command: this.executable, args: ["lsp", "--stdio"], options: { cwd: this.projectRoot } };
  }
}
