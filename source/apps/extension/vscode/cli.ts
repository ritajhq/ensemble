import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Executable } from "vscode-languageclient/node";

const run = promisify(execFile);

/** Where `.ensemble/install.sh` puts `ens` by default. */
const INSTALLER_DEFAULT = join(homedir(), ".ensemble", "bin", "ens");

/** The `ens` binary, invoked as a child process. */
export class Cli {
  constructor(private readonly executable: string) {}

  /**
   * Finds `ens`: an explicitly configured path first, then the installer's
   * default location, then plain `ens` on the PATH. The default location
   * matters because an editor launched from the desktop doesn't read the
   * shell profile that puts `~/.ensemble/bin` on the PATH.
   */
  static locate(configured?: string): Cli {
    if (configured) return new Cli(configured);
    if (existsSync(INSTALLER_DEFAULT)) return new Cli(INSTALLER_DEFAULT);
    return new Cli("ens");
  }

  async version(): Promise<string> {
    const { stdout } = await run(this.executable, ["--version"]);
    return stdout.trim();
  }

  /** How to launch `ens lsp`, for a language client to own the process. */
  languageServer(): Executable {
    return { command: this.executable, args: ["lsp", "--stdio"] };
  }
}
