import * as vscode from "vscode";
import { Cli } from "./cli.ts";
import { LanguageService } from "./language-service.ts";

let languageService: LanguageService | undefined;

// VS Code's contract: the entry module must export activate/deactivate functions.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const cli = Cli.locate(vscode.workspace.getConfiguration("ensemble").get<string>("executable"));

  context.subscriptions.push(
    vscode.commands.registerCommand("ensemble.hello", async () => {
      const version = await cli.version();
      vscode.window.showInformationMessage(`Hello from Ensemble! (${version})`);
    }),
  );

  languageService = new LanguageService(cli);
  await languageService.start();
}

export async function deactivate(): Promise<void> {
  await languageService?.stop();
}
