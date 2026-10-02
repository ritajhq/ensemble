import * as vscode from "vscode";
import { Delegate, type Emitter } from "@duesabati/evento";
import type { Cli } from "../cli.ts";
import type * as Status from "../status.ts";

/** Files whose change can change what `ens status` reports. */
const WATCHED = [
  ".ensemble/config.yaml",
  ".ensemble/vendor.lock.yml",
  ".ensemble/kits/*/*",
  "ci/*/{delivery.yml,delivery}",
];
/** Several files usually change together (e.g. `ens kit install`), so wait for the burst to settle before asking `ens` again. */
const DEBOUNCE_MS = 300;

/**
 * The project's `ens status --json`, shared by every sidebar pane: loaded
 * once per change rather than once per pane, and reloaded whenever a file that
 * feeds it changes.
 */
export class Source implements vscode.Disposable {
  private readonly changed = new Delegate<[]>();
  private readonly watchers: vscode.FileSystemWatcher[];
  private status: Promise<Status.Document | undefined> | undefined;
  private pending: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly cli: Cli, readonly root: vscode.Uri) {
    this.watchers = WATCHED.map((glob) => {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, glob));
      watcher.onDidCreate(() => this.refreshSoon());
      watcher.onDidChange(() => this.refreshSoon());
      watcher.onDidDelete(() => this.refreshSoon());
      return watcher;
    });
  }

  get OnChange(): Emitter<[]> {
    return this.changed;
  }

  /** The current status, or undefined when `ens` couldn't report it (already shown to the user). */
  current(): Promise<Status.Document | undefined> {
    this.status ??= this.load();
    return this.status;
  }

  refresh(): void {
    this.status = undefined;
    this.changed.Invoke();
  }

  dispose(): void {
    clearTimeout(this.pending);
    this.watchers.forEach((watcher) => watcher.dispose());
  }

  private refreshSoon(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.refresh(), DEBOUNCE_MS);
  }

  private async load(): Promise<Status.Document | undefined> {
    try {
      return await this.cli.status();
    } catch (error) {
      vscode.window.showWarningMessage(`Ensemble: couldn't read the project status (${(error as Error).message}).`);
      return undefined;
    }
  }
}
