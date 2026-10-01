import * as Core from "@ensemble/core";
import { type CompletionItem, CompletionItemKind, type Position } from "vscode-languageserver";

/** An unterminated `${...` ending at the cursor — the reference being typed. */
const OPEN_REFERENCE = /\$\{[\w./-]*$/;
const TOP_LEVEL_KEY = /^([A-Za-z_][\w-]*):/;

/** Completes the `${...}` reference under the cursor with every target the workload makes available. */
export class ReferenceCompletion {
  constructor(
    private readonly targets = new Core.Deploy.Contracts.ReferenceTargets(
      new Core.Deploy.Contracts.Catalog(Core.Deploy.Contracts.SEEDED),
    ),
    private readonly syntax = new Core.Deploy.ReferenceSyntax(),
  ) {}

  complete(text: string, position: Position, workload: Core.Deploy.Workload): CompletionItem[] {
    const lines = text.split("\n");
    const line = lines[position.line] ?? "";
    const open = OPEN_REFERENCE.exec(line.slice(0, position.character));
    if (!open) return [];

    const closed = line[position.character] === "}";
    const range = {
      start: { line: position.line, character: open.index },
      end: { line: position.line, character: position.character + (closed ? 1 : 0) },
    };

    return this.targetsAt(lines, position.line, workload).map(({ reference, detail }) => {
      const label = this.syntax.format(reference);
      return {
        label,
        detail,
        kind: CompletionItemKind.Reference,
        filterText: label,
        textEdit: { range, newText: label },
      };
    });
  }

  /** A task's arguments may also reference the deployment itself. */
  private targetsAt(lines: string[], line: number, workload: Core.Deploy.Workload): Core.Deploy.Contracts.ReferenceTarget[] {
    const targets = this.targets.ofWorkload(workload);
    if (this.sectionAt(lines, line) !== "tasks") return targets;
    return [...targets, ...this.targets.ofDeployment()];
  }

  private sectionAt(lines: string[], line: number): string | undefined {
    for (let index = line; index >= 0; index--) {
      const key = TOP_LEVEL_KEY.exec(lines[index]);
      if (key) return key[1];
    }
    return undefined;
  }
}
