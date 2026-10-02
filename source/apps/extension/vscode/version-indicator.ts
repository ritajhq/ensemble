import * as vscode from "vscode";
import type { Cli } from "./cli.ts";

const INSTALL_URL = "https://github.com/ritajhq/ensemble#installation";

const parts = (version: string) => version.split(/[-+]/)[0].split(".").map(Number);
const isOlder = (version: string, than: string) => {
  const [a, b] = [parts(version), parts(than)];
  const differing = a.findIndex((n, i) => n !== b[i]);
  return differing !== -1 && a[differing] < b[differing];
};

/**
 * The installed `ens` version in the status bar. The extension is released
 * alongside `ens` under the same version, so an `ens` older than the
 * extension may lack what the extension calls (e.g. `ens lsp`,
 * `ens status --json`) — that case is highlighted, and clicking offers the
 * fix.
 */
export class VersionIndicator implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

  constructor(private readonly cli: Cli, private readonly extensionVersion: string) {
    this.item.name = "Ensemble CLI version";
  }

  async show(): Promise<void> {
    const version = await this.cli.version();
    if (!version) return this.showMissing();
    if (isOlder(version, this.extensionVersion)) return this.showOutdated(version);

    this.item.text = `$(check) ens ${version}`;
    this.item.tooltip = `Ensemble CLI ${version} (${this.cli.executable})`;
    this.item.backgroundColor = undefined;
    this.item.command = undefined;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  private showMissing(): void {
    this.item.text = "$(error) ens not found";
    this.item.tooltip = "The Ensemble CLI couldn't be run — click for installation instructions.";
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    this.item.command = { title: "Install", command: "vscode.open", arguments: [vscode.Uri.parse(INSTALL_URL)] };
    this.item.show();
  }

  private showOutdated(version: string): void {
    this.item.text = `$(warning) ens ${version}`;
    this.item.tooltip = `Ensemble CLI ${version} is older than this extension (${this.extensionVersion}) — click to update it.`;
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    this.item.command = { title: "Update", command: "ensemble.updateCli", arguments: [this.extensionVersion] };
    this.item.show();
  }
}
