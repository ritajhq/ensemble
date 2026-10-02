import * as vscode from "vscode";
import type { Cli } from "../cli.ts";
import { type Node, sections } from "./nodes.ts";

/** Files whose change can change what `ens status` reports. */
const WATCHED = [
  ".ensemble/config.yaml",
  ".ensemble/vendor.lock.yml",
  ".ensemble/kits/*/*",
  "ci/*/{delivery.yml,delivery}",
];
const DEBOUNCE_MS = 300;

/**
 * The sidebar's Project view: what `ens status --json` reports, refreshed
 * whenever a file that feeds it changes. `onDidChangeTreeData` is VS Code's
 * own event type, which a `TreeDataProvider` must expose.
 */
export class Tree implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly watchers: vscode.FileSystemWatcher[];
  private roots: Promise<Node[]> | undefined;
  private pending: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly cli: Cli, private readonly root: vscode.Uri) {
    this.watchers = WATCHED.map((glob) => {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, glob));
      watcher.onDidCreate(() => this.refreshSoon());
      watcher.onDidChange(() => this.refreshSoon());
      watcher.onDidDelete(() => this.refreshSoon());
      return watcher;
    });
  }

  refresh(): void {
    this.roots = undefined;
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node.item();
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node) return node.children();
    this.roots ??= this.load();
    return await this.roots;
  }

  dispose(): void {
    clearTimeout(this.pending);
    this.watchers.forEach((watcher) => watcher.dispose());
    this.changed.dispose();
  }

  /** Several files usually change together (e.g. `ens kit install`), so wait for the burst to settle before asking `ens` again. */
  private refreshSoon(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.refresh(), DEBOUNCE_MS);
  }

  private async load(): Promise<Node[]> {
    try {
      return sections(await this.cli.status(), this.root);
    } catch (error) {
      vscode.window.showWarningMessage(`Ensemble: couldn't read the project status (${(error as Error).message}).`);
      return [];
    }
  }
}
