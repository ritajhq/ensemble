import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The `ens` binary, invoked as a child process. */
export class Cli {
  constructor(private readonly executable = "ens") {}

  async version(): Promise<string> {
    const { stdout } = await run(this.executable, ["--version"]);
    return stdout.trim();
  }
}
