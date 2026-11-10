import type * as Core from "@ensemble/core";
import {
  type Document,
  isMap,
  isPair,
  isSeq,
  LineCounter,
  type Node,
  parseDocument,
} from "yaml";
import type { Range } from "vscode-languageserver";

/** A YAML syntax error, where it is in the text. */
export interface SyntaxProblem {
  readonly range: Range;
  readonly message: string;
}

/**
 * Where each node of one manifest's text sits. Core checks plain values and
 * names a problem by its path in the manifest; this turns that path back into
 * the lines an editor marks. The YAML library here keeps positions and reads a
 * half-typed document as far as it can, which is most of the time an editor
 * asks.
 */
export class SourceMap {
  private readonly lines = new LineCounter();
  private readonly document: Document.Parsed;

  constructor(text: string) {
    this.document = parseDocument(text, { lineCounter: this.lines });
  }

  /** The text's YAML syntax errors: until they're fixed, there's no manifest to check. */
  syntaxProblems(): SyntaxProblem[] {
    return this.document.errors.map((error) => ({
      range: this.rangeBetween(error.pos[0], error.pos[1]),
      message: error.message.split("\n")[0],
    }));
  }

  /** The manifest as plain values, as far as it parses. */
  values(): unknown {
    return this.document.toJS();
  }

  /**
   * The text a problem at `path` is about: the key of the node it names, or
   * — when that node isn't written yet, as with a missing required field —
   * the deepest one that is.
   */
  rangeOf(path: readonly Core.Deploy.PathSegment[]): Range {
    let node: unknown = this.document.contents;
    let range = this.rangeOfNode(node) ?? this.rangeBetween(0, 0);

    for (const segment of path) {
      const step = this.step(node, segment);
      if (!step) break;
      node = step.node;
      range = step.range ?? range;
    }
    return range;
  }

  /** One segment down from `node`: a mapping's entry, marked by its key, or a list's item. */
  private step(
    node: unknown,
    segment: Core.Deploy.PathSegment,
  ): { node: unknown; range?: Range } | undefined {
    if (isMap(node)) {
      const pair = node.items.find((item) =>
        isPair(item) && this.keyOf(item.key) === String(segment)
      );
      if (!pair) return undefined;
      return { node: pair.value, range: this.rangeOfNode(pair.key) };
    }
    if (isSeq(node) && typeof segment === "number") {
      const item = node.items[segment];
      if (item === undefined) return undefined;
      return { node: item, range: this.rangeOfNode(item) };
    }
    return undefined;
  }

  private keyOf(key: unknown): string | undefined {
    const value = (key as { value?: unknown } | null)?.value;
    return value === undefined || value === null ? undefined : String(value);
  }

  private rangeOfNode(node: unknown): Range | undefined {
    const range = (node as Node | null)?.range;
    if (!range) return undefined;
    return this.rangeBetween(range[0], range[1]);
  }

  private rangeBetween(start: number, end: number): Range {
    return { start: this.positionOf(start), end: this.positionOf(end) };
  }

  /** LSP positions count from 0; the YAML library's from 1. */
  private positionOf(offset: number) {
    const { line, col } = this.lines.linePos(offset);
    return { line: line - 1, character: col - 1 };
  }
}
