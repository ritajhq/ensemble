import * as vscode from "vscode";
import type { Cli } from "./cli.ts";

const SAFE = /^[\w@%+=:,./-]+$/;
const quote = (arg: string) => SAFE.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;

/** Runs `ens` commands in one reusable "Ensemble" terminal, so their output stays visible and interactive prompts (e.g. `ens release`'s confirmation) still work. */
export class Runner {
  private terminal: vscode.Terminal | undefined;

  constructor(
    private readonly cli: Cli,
    private readonly projectRoot: string | undefined,
  ) {}

  run(args: readonly string[]): void {
    const terminal = this.ownTerminal();
    terminal.show();
    terminal.sendText([this.cli.executable, ...args].map(quote).join(" "));
  }

  private ownTerminal(): vscode.Terminal {
    if (this.terminal && this.terminal.exitStatus === undefined) return this.terminal;
    this.terminal = vscode.window.createTerminal({ name: "Ensemble", cwd: this.projectRoot });
    return this.terminal;
  }
}
