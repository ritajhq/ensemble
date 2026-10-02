import * as vscode from "vscode";
import type { Cli } from "./cli.ts";

/** Whitespace-separated words, where '…' or "…" keeps spaces inside one word — how a shell would split the line. */
const WORDS = /"([^"]*)"|'([^']*)'|(\S+)/g;

/** One task invocation's answers, remembered per task so the next run starts from them. */
interface Choice {
  kit: string;
  input: string;
}

/**
 * Asks how to run a workload's task — which deploy kit resolves its
 * arguments, and any input to hand it as `$1..$n` — preselecting the last
 * answers for that task, and returns the `ens delivery task` arguments.
 */
export class TaskOptions {
  constructor(private readonly cli: Cli, private readonly memory: vscode.Memento) {}

  async ask(workload: string, task: string): Promise<string[] | undefined> {
    const last = this.memory.get<Choice>(this.key(workload, task));

    const kit = await this.pickKit(task, last?.kit);
    if (!kit) return undefined;
    const input = await vscode.window.showInputBox({
      title: `Run ${task}: input`,
      prompt: "Arguments handed to the task as $1..$n (leave empty for none)",
      value: last?.input ?? "",
      ignoreFocusOut: true,
    });
    if (input === undefined) return undefined;

    await this.memory.update(this.key(workload, task), { kit, input });
    return ["delivery", "task", workload, kit, task, ...this.words(input)];
  }

  private async pickKit(task: string, last?: string): Promise<string | undefined> {
    const status = await this.cli.status();
    const kits = status.kits.filter((kit) => kit.role === "deploy").map((kit) => kit.name);
    const ordered = [...kits].sort((a, b) => Number(b === last) - Number(a === last));
    const items = ordered.map((label) => label === last ? { label, description: "last used" } : { label });
    const chosen = await vscode.window.showQuickPick(items, {
      title: `Run ${task}: deploy kit to resolve its arguments with`,
      ignoreFocusOut: true,
    });
    return chosen?.label;
  }

  private words(input: string): string[] {
    return [...input.matchAll(WORDS)].map((match) => match[1] ?? match[2] ?? match[3]);
  }

  private key(workload: string, task: string): string {
    return `ensemble.task.${workload}.${task}`;
  }
}
