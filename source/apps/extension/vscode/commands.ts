import * as vscode from "vscode";
import type { DeployOptions } from "./deploy-options.ts";
import type * as Project from "./project/index.ts";
import type { Runner } from "./runner.ts";

const BUMPS = ["patch", "minor", "major"];
const KIT_ROLES = ["build", "pack", "deploy", "lib"];

const ask = (title: string, prompt: string) => vscode.window.showInputBox({ title, prompt, ignoreFocusOut: true });
const pick = (title: string, items: string[]) => vscode.window.showQuickPick(items, { title, ignoreFocusOut: true });

/** Every `ensemble.*` command: each one asks for whatever arguments it needs, then runs the matching `ens` command in the Ensemble terminal. */
export class Commands {
  constructor(
    private readonly runner: Runner,
    private readonly deployOptions: DeployOptions,
    private readonly tree: Project.Tree,
  ) {}

  register(): vscode.Disposable[] {
    const handlers: Record<string, (...args: never[]) => unknown> = {
      "ensemble.refresh": () => this.tree.refresh(),
      "ensemble.build": (node: Project.AppNode) => this.runner.run(["build", node.app.name]),
      "ensemble.develop": (target: Project.WorkloadNode | string) => this.runner.run(["develop", this.workloadOf(target)]),
      "ensemble.deploy": (target: Project.WorkloadNode | string) => this.deploy(this.workloadOf(target)),
      "ensemble.release": () => this.release(),
      "ensemble.kit.new": () => this.newKit(),
      "ensemble.kit.install": () => this.install("kit"),
      "ensemble.kit.update": (node: Project.KitNode) => this.update("kit", node.kit.name),
      "ensemble.kit.pin": (node: Project.KitNode) => this.pin("kit", node.kit.name),
      "ensemble.kit.contribute": (node: Project.KitNode) => this.runner.run(["kit", "contribute", node.kit.name]),
      "ensemble.kit.eject": (node: Project.KitNode) => this.ejectKit(node.kit.name),
      "ensemble.kit.uninstall": (node: Project.KitNode) => this.uninstall("kit", node.kit.name),
      "ensemble.lib.new": () => this.newLibrary(),
      "ensemble.lib.install": () => this.install("lib"),
      "ensemble.lib.update": (node: Project.LibraryNode) => this.update("lib", node.library.name),
      "ensemble.lib.pin": (node: Project.LibraryNode) => this.pin("lib", node.library.name),
      "ensemble.lib.contribute": (node: Project.LibraryNode) => this.runner.run(["lib", "contribute", node.library.name]),
      "ensemble.lib.eject": (node: Project.LibraryNode) => this.runner.run(["lib", "eject", node.library.name]),
      "ensemble.lib.uninstall": (node: Project.LibraryNode) => this.uninstall("lib", node.library.name),
      "ensemble.lib.publish": (node: Project.LibraryNode) => this.publishLibrary(node),
      "ensemble.updateCli": (version: string) => this.runner.run(["version", "set", version]),
    };
    return Object.entries(handlers).map(([id, handler]) => vscode.commands.registerCommand(id, handler));
  }

  /** Lenses pass a workload's name; the tree passes its row. */
  private workloadOf(target: Project.WorkloadNode | string): string {
    return typeof target === "string" ? target : target.workload.name;
  }

  private async deploy(workload: string): Promise<void> {
    const args = await this.deployOptions.ask(workload);
    if (args) this.runner.run(args);
  }

  private async release(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      [
        ...BUMPS.map((bump) => ({ label: bump, detail: `ens release next ${bump}`, args: ["release", "next", bump] })),
        ...BUMPS.map((bump) => ({ label: `${bump} (dry run)`, detail: `ens release next ${bump} --dry-run`, args: ["release", "next", bump, "--dry-run"] })),
      ],
      { title: "Release every workload's releases and the core libraries", ignoreFocusOut: true },
    );
    if (choice) this.runner.run(choice.args);
  }

  private async newKit(): Promise<void> {
    const name = await ask("New kit", "Kit name");
    if (!name) return;
    const role = await pick("New kit: role", KIT_ROLES);
    if (role) this.runner.run(["kit", "new", name, role]);
  }

  private async newLibrary(): Promise<void> {
    const name = await ask("New library", "Library name (created under source/libs/)");
    if (name) this.runner.run(["lib", "new", name]);
  }

  private async install(kind: "kit" | "lib"): Promise<void> {
    const url = await ask(`Install ${kind}`, "Git URL, optionally <url>@<ref>");
    if (url) this.runner.run([kind, "install", url]);
  }

  private async update(kind: "kit" | "lib", name: string): Promise<void> {
    const bump = await pick(`Update ${name} to its next…`, BUMPS);
    if (bump) this.runner.run([kind, "update", name, bump]);
  }

  private async pin(kind: "kit" | "lib", name: string): Promise<void> {
    const ref = await ask(`Pin ${name}`, "Git ref (tag, branch or commit) to move the checkout to");
    if (ref) this.runner.run([kind, "pin", name, ref]);
  }

  /** Deletes a checkout, so it asks first; `ens` itself still refuses while the project uses it or it has local changes. */
  private async uninstall(kind: "kit" | "lib", name: string): Promise<void> {
    const uninstall = "Uninstall";
    const choice = await vscode.window.showWarningMessage(
      `Uninstall the vendored ${kind} "${name}"? Its checkout will be deleted.`,
      { modal: true },
      uninstall,
    );
    if (choice === uninstall) this.runner.run([kind, "uninstall", name]);
  }

  private async ejectKit(name: string): Promise<void> {
    const remote = await ask(`Eject ${name}`, "Remote repository to push the kit to");
    if (remote) this.runner.run(["kit", "eject", name, remote]);
  }

  private async publishLibrary(node: Project.LibraryNode): Promise<void> {
    const kit = node.library.kits.length === 1 ? node.library.kits[0] : await pick(`Publish ${node.library.package} through`, node.library.kits);
    if (!kit) return;
    const version = await ask(`Publish ${node.library.package}`, "Version to publish");
    if (version) this.runner.run(["lib", "publish", node.library.name, kit, version]);
  }
}
