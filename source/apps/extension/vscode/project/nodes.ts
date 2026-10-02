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

/** A top-level group (Apps, Workloads, Kits, Libraries). `contextValue` lets the manifest attach section-wide actions, e.g. "new kit". */
export class Section extends Node {
  constructor(
    private readonly label: string,
    private readonly icon: string,
    private readonly contextValue: string,
    private readonly entries: Node[],
  ) {
    super();
  }

  item(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon(this.icon);
    item.contextValue = this.contextValue;
    item.description = this.entries.length === 0 ? "none" : undefined;
    return item;
  }

  override children(): Node[] {
    return this.entries;
  }
}

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
    return [...ships, ...resources];
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

/** The tree's top level, built from one `ens status --json` document. */
export function sections(status: Status.Document, root: vscode.Uri): Node[] {
  const kitsOf = (role: Status.KitRole) =>
    status.kits.filter((kit) => kit.role === role).map((kit) => new KitNode(kit, root));
  const librariesOf = (scope: Status.Library["scope"]) =>
    status.libraries.filter((library) => library.scope === scope).map((library) => new LibraryNode(library, root));

  return [
    new Section("Apps", "package", "section.apps", status.apps.map((app) => new AppNode(app, root))),
    new Section("Workloads", "server-environment", "section.workloads", status.workloads.map((w) => new WorkloadNode(w, root))),
    new Section("Kits", "tools", "section.kits", ROLES.map((role) => new KitRoleNode(role, kitsOf(role)))),
    new Section(
      "Libraries",
      "library",
      "section.libraries",
      LIBRARY_SCOPES.map(({ scope, label }) => new LibraryScopeNode(label, librariesOf(scope))),
    ),
  ];
}
