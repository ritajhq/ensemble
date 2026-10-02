import * as vscode from "vscode";
import { Cli } from "./cli.ts";
import { CliUpdates } from "./cli-updates.ts";
import { Commands } from "./commands.ts";
import { DeliveryLenses } from "./delivery-lenses.ts";
import { DeployOptions } from "./deploy-options.ts";
import { LanguageService } from "./language-service.ts";
import * as Project from "./project/index.ts";
import { Runner } from "./runner.ts";
import { TaskOptions } from "./task-options.ts";
import { VersionIndicator } from "./version-indicator.ts";

const DELIVERY_MANIFESTS: vscode.DocumentSelector = [{ scheme: "file", pattern: "**/ci/*/{delivery.yml,delivery}" }];

let languageService: LanguageService | undefined;

// VS Code's contract: the entry module must export activate/deactivate functions.
// Activation only wires things together; everything after runs in response to editor events.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  const cli = Cli.locate(vscode.workspace.getConfiguration("ensemble").get<string>("executable"), root?.fsPath);
  const runner = new Runner(cli, root?.fsPath);
  const updates = new CliUpdates(cli);
  context.subscriptions.push(updates);

  if (root) {
    const source = new Project.Source(cli, root);
    updates.OnUpdate.Do(() => source.refresh());
    for (const [section, roots] of Object.entries(Project.Roots)) {
      const view = new Project.View(source, roots);
      context.subscriptions.push(view, vscode.window.registerTreeDataProvider(`ensemble.${section}`, view));
    }
    const deployOptions = new DeployOptions(cli, context.workspaceState);
    const taskOptions = new TaskOptions(cli, context.workspaceState);
    context.subscriptions.push(source, ...new Commands(runner, deployOptions, taskOptions, source).register());
  }
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(DELIVERY_MANIFESTS, new DeliveryLenses()));

  const version = new VersionIndicator(cli, context.extension.packageJSON.version);
  context.subscriptions.push(version);
  void version.show();
  updates.OnUpdate.Do(() => void version.show());

  languageService = new LanguageService(cli);
  const service = languageService;
  updates.OnUpdate.Do(() => void service.restart());
  await service.start();
}

export async function deactivate(): Promise<void> {
  await languageService?.stop();
}
