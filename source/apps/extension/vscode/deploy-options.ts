import * as vscode from "vscode";
import type { Cli } from "./cli.ts";

/** What `ens deploy <workload> <kit>` does once rendered: its default apply, or one of the stop-early flags. */
const MODES = [
  { label: "Apply", detail: "Render and bring the workload up (or reconcile it).", flags: [] },
  { label: "Plan", detail: "Render and show what would change, then stop.", flags: ["--plan"] },
  { label: "Eject", detail: "Render and write the artifact to the outputs dir, then stop.", flags: ["--eject"] },
] as const;

const ARTIFACTS = [
  { label: "published", detail: "Resolve ${release.*} to published artifacts (a released version)." },
  { label: "local", detail: "Resolve ${release.*} to locally packed artifacts (packs them first)." },
] as const;

/** One deploy invocation's choices, remembered per workload so the next deploy starts from them. */
interface Choice {
  kit: string;
  mode: typeof MODES[number]["label"];
  artifacts: typeof ARTIFACTS[number]["label"];
  version: string;
}

/**
 * Asks how to deploy a workload — deploy kit, mode, artifacts and, for
 * published artifacts, which version — preselecting the last answers for that
 * workload, and returns the `ens deploy` arguments. Anything rarer (e.g.
 * `--accept-capability-gaps`) stays a terminal-only flag.
 */
export class DeployOptions {
  constructor(private readonly cli: Cli, private readonly memory: vscode.Memento) {}

  async ask(workload: string): Promise<string[] | undefined> {
    const last = this.memory.get<Choice>(this.key(workload));

    const kit = await this.pick("Deploy kit", await this.deployKits(), last?.kit);
    if (!kit) return undefined;
    const mode = await this.pick("Mode", MODES.map((m) => ({ label: m.label, detail: m.detail })), last?.mode);
    if (!mode) return undefined;
    const artifacts = await this.pick("Artifacts", [...ARTIFACTS], last?.artifacts);
    if (!artifacts) return undefined;
    const version = artifacts === "published" ? await this.askVersion(last?.version) : "latest";
    if (version === undefined) return undefined;

    const choice: Choice = { kit, mode: mode as Choice["mode"], artifacts: artifacts as Choice["artifacts"], version };
    await this.memory.update(this.key(workload), choice);
    return this.argumentsFor(workload, choice);
  }

  private argumentsFor(workload: string, choice: Choice): string[] {
    const flags = MODES.find((m) => m.label === choice.mode)?.flags ?? [];
    const versionArgs = choice.artifacts === "published" && choice.version !== "latest" ? ["--version", choice.version] : [];
    return ["deploy", workload, choice.kit, ...flags, "--artifacts", choice.artifacts, ...versionArgs];
  }

  private async deployKits(): Promise<vscode.QuickPickItem[]> {
    const status = await this.cli.status();
    return status.kits.filter((kit) => kit.role === "deploy").map((kit) => ({ label: kit.name }));
  }

  /** A quick pick with the remembered answer first and marked, so Enter repeats the last deploy. */
  private async pick(title: string, items: vscode.QuickPickItem[], last?: string): Promise<string | undefined> {
    const ordered = [...items].sort((a, b) => Number(b.label === last) - Number(a.label === last));
    const marked = ordered.map((item) => item.label === last ? { ...item, description: "last used" } : item);
    const chosen = await vscode.window.showQuickPick(marked, { title: `Deploy: ${title}`, ignoreFocusOut: true });
    return chosen?.label;
  }

  private async askVersion(last?: string): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      title: "Deploy: Version",
      prompt: "Released version to resolve ${release.*} to",
      value: last ?? "latest",
      ignoreFocusOut: true,
    });
  }

  private key(workload: string): string {
    return `ensemble.deploy.${workload}`;
  }
}
