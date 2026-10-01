import * as vscode from "vscode";
import { Cli } from "./cli.ts";

// VS Code's contract: the entry module must export activate/deactivate functions.
export function activate(context: vscode.ExtensionContext): void {
  const cli = new Cli();

  context.subscriptions.push(
    vscode.commands.registerCommand("ensemble.hello", async () => {
      const version = await cli.version();
      vscode.window.showInformationMessage(`Hello from Ensemble! (${version})`);
    }),
  );
}

export function deactivate(): void {}
