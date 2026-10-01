import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Executable } from "vscode-languageclient/node";

const run = promisify(execFile);

/** The `ens` binary, invoked as a child process. */
export class Cli {
  constructor(private readonly executable = "ens") {}

  async version(): Promise<string> {
    const { stdout } = await run(this.executable, ["--version"]);
    return stdout.trim();
  }

  /** How to launch `ens lsp`, for a language client to own the process. */
  languageServer(): Executable {
    return { command: this.executable, args: ["lsp", "--stdio"] };
  }
}
