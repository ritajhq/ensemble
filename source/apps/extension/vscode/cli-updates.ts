import * as vscode from "vscode";
import { basename, dirname, isAbsolute } from "node:path";
import { Delegate, type Emitter } from "@duesabati/evento";
import type { Cli } from "./cli.ts";

/** An update replaces the binary in a few steps (write, rename, chmod); wait for them to settle. */
const SETTLE_MS = 500;

/**
 * Notices when the `ens` binary is replaced — `ens version set`, a reinstall,
 * a fresh `deno task compile` — so whatever depends on which `ens` is
 * installed can catch up without a window reload. Watches the binary's
 * directory rather than the file, because installers replace the file instead
 * of writing into it.
 */
export class CliUpdates implements vscode.Disposable {
  private readonly updated = new Delegate<[]>();
  private readonly watcher: vscode.FileSystemWatcher | undefined;
  private pending: ReturnType<typeof setTimeout> | undefined;

  constructor(cli: Cli) {
    if (!isAbsolute(cli.executable)) return;
    const pattern = new vscode.RelativePattern(vscode.Uri.file(dirname(cli.executable)), basename(cli.executable));
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => this.settle());
    this.watcher.onDidChange(() => this.settle());
  }

  get OnUpdate(): Emitter<[]> {
    return this.updated;
  }

  dispose(): void {
    clearTimeout(this.pending);
    this.watcher?.dispose();
  }

  private settle(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.updated.Invoke(), SETTLE_MS);
  }
}
