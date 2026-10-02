import * as vscode from "vscode";
import type * as Status from "../status.ts";

const ROLES: readonly Status.KitRole[] = ["build", "pack", "deploy", "lib"];
const LIBRARY_SCOPES = [
  { scope: "core", label: "core", path: "source/core" },
  { scope: "libs", label: "libs", path: "source/libs" },
] as const;

/** One row of the Project tree. Each kind of row builds its own `TreeItem` and children, so the tree never switches on kinds. */
export abstract class Node {
  abstract item(): vscode.TreeItem;

  children(): Node[] {
    return [];
  }
}

const reveal = (root: vscode.Uri, path: string): vscode.Command => ({
  title: "Reveal",
  command: "revealInExplorer",
  arguments: [vscode.Uri.joinPath(root, path)],
});

const open = (root: vscode.Uri, path: string): vscode.Command => ({
  title: "Open",
  command: "vscode.open",
  arguments: [vscode.Uri.joinPath(root, path)],
});

const vendoredAt = (vendored?: Status.Vendoring) => vendored ? `@ ${vendored.ref}` : "local";

export class AppNode extends Node {
  constructor(readonly app: Status.App, private readonly root: vscode.Uri) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.app.name);
    item.description = this.app.target ? `${this.app.kit} · ${this.app.target}` : this.app.kit;
    item.iconPath = new vscode.ThemeIcon("package");
    item.contextValue = "app";
    item.command = reveal(this.root, `source/apps/${this.app.name}`);
    return item;
  }
}

export class WorkloadNode extends Node {
  constructor(readonly workload: Status.Workload, private readonly root: vscode.Uri) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.workload.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = this.workload.ships.map((ship) => ship.name).join(", ");
    item.iconPath = new vscode.ThemeIcon("server-environment");
    item.contextValue = "workload";
    item.tooltip = this.workload.manifest;
    item.command = open(this.root, this.workload.manifest);
    return item;
  }

  override children(): Node[] {
    const ships = this.workload.ships.map((ship) => new Leaf(ship.name, ship.kit, "archive", "ship"));
    const resources = Object.entries(this.workload.resources).map(([category, names]) =>
      new Leaf(category, names.join(", "), "symbol-field", "resources")
    );
    // `tasks` is newer than `ens status --json` itself; an older `ens` simply has none to list.
    const tasks = (this.workload.tasks ?? []).length === 0 ? [] : [new TasksNode(this.workload)];
    return [...ships, ...resources, ...tasks];
  }
}

class TasksNode extends Node {
  constructor(private readonly workload: Status.Workload) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem("tasks", vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon("checklist");
    return item;
  }

  override children(): Node[] {
    return this.workload.tasks.map((task) => new TaskNode(this.workload.name, task));
  }
}

/** A workload's `tasks:` entry, run with `ens delivery task`. */
export class TaskNode extends Node {
  constructor(readonly workload: string, readonly task: Status.Task) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.task.name);
    item.description = this.task.command;
    item.tooltip = new vscode.MarkdownString(
      `\`${this.task.command}\`` +
        (this.task.arguments.length > 0 ? `\n\nArguments: ${this.task.arguments.map((a) => `\`${a}\``).join(", ")}` : ""),
    );
    item.iconPath = new vscode.ThemeIcon("terminal");
    item.contextValue = "task";
    return item;
  }
}

/** A row with nothing under it and no actions of its own: a ship, or a category of deploy resources. */
class Leaf extends Node {
  constructor(
    private readonly label: string,
    private readonly description: string,
    private readonly icon: string,
    private readonly contextValue: string,
  ) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label);
    item.description = this.description;
    item.iconPath = new vscode.ThemeIcon(this.icon);
    item.contextValue = this.contextValue;
    return item;
  }
}

class KitRoleNode extends Node {
  constructor(private readonly role: Status.KitRole, private readonly kits: KitNode[]) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.role, vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon("folder-library");
    item.description = this.kits.length === 0 ? "none" : undefined;
    return item;
  }

  override children(): Node[] {
    return this.kits;
  }
}

export class KitNode extends Node {
  constructor(readonly kit: Status.Kit, private readonly root: vscode.Uri) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.kit.name);
    item.description = vendoredAt(this.kit.vendored);
    item.tooltip = this.kit.vendored ? `${this.kit.vendored.repo} @ ${this.kit.vendored.ref}` : this.kit.path;
    item.iconPath = new vscode.ThemeIcon("tools");
    item.contextValue = this.kit.vendored ? "kit.vendored" : "kit.local";
    item.command = reveal(this.root, this.kit.path);
    return item;
  }
}

class LibraryScopeNode extends Node {
  constructor(private readonly label: string, private readonly libraries: LibraryNode[]) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon("folder-library");
    item.description = this.libraries.length === 0 ? "none" : undefined;
    return item;
  }

  override children(): Node[] {
    return this.libraries;
  }
}

export class LibraryNode extends Node {
  constructor(readonly library: Status.Library, private readonly root: vscode.Uri) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.library.package);
    item.description = this.library.scope === "core" ? this.library.kits.join(", ") : vendoredAt(this.library.vendored);
    item.tooltip = this.library.vendored ? `${this.library.vendored.repo} @ ${this.library.vendored.ref}` : this.library.path;
    item.iconPath = new vscode.ThemeIcon("library");
    item.contextValue = this.contextValue();
    item.command = reveal(this.root, this.library.path);
    return item;
  }

  /** Core libraries are released with the project; portable ones can also be vendored and managed on their own. */
  private contextValue(): string {
    if (this.library.scope === "core") return "library.core";
    return this.library.vendored ? "library.vendored" : "library.local";
  }
}

/** Each pane's top-level rows, built from one `ens status --json` document. */
export const Roots = {
  apps: (status: Status.Document, root: vscode.Uri): Node[] => status.apps.map((app) => new AppNode(app, root)),

  workloads: (status: Status.Document, root: vscode.Uri): Node[] =>
    status.workloads.map((workload) => new WorkloadNode(workload, root)),

  kits: (status: Status.Document, root: vscode.Uri): Node[] =>
    ROLES.map((role) =>
      new KitRoleNode(role, status.kits.filter((kit) => kit.role === role).map((kit) => new KitNode(kit, root)))
    ),

  libraries: (status: Status.Document, root: vscode.Uri): Node[] =>
    LIBRARY_SCOPES.map(({ scope, label }) =>
      new LibraryScopeNode(
        label,
        status.libraries.filter((library) => library.scope === scope).map((library) => new LibraryNode(library, root)),
      )
    ),
};
