import * as vscode from "vscode";
import type * as Status from "../status.ts";
import type { Node } from "./nodes.ts";
import type { Source } from "./source.ts";

/** One sidebar pane (Apps, Workloads, …): the slice of the shared status its `roots` picks out. `onDidChangeTreeData` is VS Code's own event type, which a `TreeDataProvider` must expose. */
export class View implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly source: Source,
    private readonly roots: (status: Status.Document, root: vscode.Uri) => Node[],
  ) {
    source.OnChange.Do(() => this.changed.fire());
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node.item();
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node) return node.children();
    const status = await this.source.current();
    return status ? this.roots(status, this.source.root) : [];
  }

  dispose(): void {
    this.changed.dispose();
  }
}
