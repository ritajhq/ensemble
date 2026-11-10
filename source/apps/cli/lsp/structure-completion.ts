import * as Core from "@ensemble/core";
import {
  type CompletionItem,
  CompletionItemKind,
  type Position,
  type Range,
} from "vscode-languageserver";
import { SourceMap } from "./source-map.ts";

/** The start of a line where a key is being typed: indentation, then part of a key. */
const KEY_POSITION = /^(\s*)([\w-]*)$/;
/** The start of a line where a scalar value is being typed after its key. */
const VALUE_POSITION = /^(\s*)([\w-]+):[ \t]+([\w.-]*)$/;
/** A line that opens or holds a mapping entry: indentation, then `key:`. */
const KEY_LINE = /^(\s*)([^\s#:][^:]*?):(?:\s|$)/;

/** Where the cursor is: typing a key of the mapping at `path`, or the value of the scalar at `path`. */
interface Cursor {
  readonly kind: "key" | "value";
  readonly path: readonly Core.Deploy.PathSegment[];
  /** The part already typed, which a suggestion replaces. */
  readonly typed: Range;
  readonly partial: string;
}

/**
 * Completes a delivery manifest's structure: the keys a mapping may hold, and
 * the closed values some scalars take (`type:`, `version:`, a secret's
 * `source:`). What fits where is core's `Manifest.Shape`; this only works out
 * where the cursor is, from indentation, so it keeps working on a line that
 * doesn't parse yet.
 */
export class StructureCompletion {
  constructor(private readonly shape = new Core.Deploy.Manifest.Shape()) {}

  /** `trigger` is the character whose typing asked: a space asks only after a key (`type: `), never while indenting. */
  complete(
    text: string,
    position: Position,
    trigger?: string,
  ): CompletionItem[] {
    const lines = text.split("\n");
    const cursor = this.cursorAt(lines, position);
    if (!cursor) return [];
    if (trigger === " " && cursor.kind === "key") return [];

    const root = new SourceMap(text).values();
    if (cursor.kind === "value") return this.values(cursor, root);
    return this.keys(cursor, root);
  }

  private keys(cursor: Cursor, root: unknown): CompletionItem[] {
    const present = this.keysPresent(root, cursor.path);
    return this.shape.keysAt(cursor.path, root)
      .filter(({ name }) => name === cursor.partial || !present.has(name))
      .map(({ name, required }, index) => ({
        label: name,
        kind: CompletionItemKind.Property,
        detail: required ? "required" : undefined,
        // Required keys first, then the rest in the order the manifest
        // declares them.
        sortText: `${required ? 0 : 1}${String(index).padStart(3, "0")}`,
        textEdit: { range: cursor.typed, newText: `${name}: ` },
      }));
  }

  private values(cursor: Cursor, root: unknown): CompletionItem[] {
    return this.shape.valuesAt(cursor.path, root).map((value) => ({
      label: value,
      kind: CompletionItemKind.EnumMember,
      textEdit: { range: cursor.typed, newText: value },
    }));
  }

  /** The keys the mapping at `path` already holds, so they aren't offered twice. */
  private keysPresent(
    root: unknown,
    path: readonly Core.Deploy.PathSegment[],
  ): Set<string> {
    let node = root;
    for (const segment of path) {
      if (typeof node !== "object" || node === null) return new Set();
      node = (node as Record<string, unknown>)[segment];
    }
    if (typeof node !== "object" || node === null) return new Set();
    return new Set(Object.keys(node));
  }

  private cursorAt(lines: string[], position: Position): Cursor | undefined {
    const before = (lines[position.line] ?? "").slice(0, position.character);

    const value = VALUE_POSITION.exec(before);
    if (value) {
      const [, indent, key, partial] = value;
      const parent = this.parentPath(lines, position.line, indent.length);
      if (!parent) return undefined;
      return {
        kind: "value",
        path: [...parent, key],
        partial,
        typed: this.typedRange(position, partial),
      };
    }

    const key = KEY_POSITION.exec(before);
    if (!key) return undefined;
    const [, indent, partial] = key;
    const path = this.parentPath(lines, position.line, indent.length);
    if (!path) return undefined;
    return {
      kind: "key",
      path,
      partial,
      typed: this.typedRange(position, partial),
    };
  }

  /**
   * The path of the mapping a key indented by `indent` on line `line` belongs
   * to: each line above that's less indented and opens a `key:` is one level
   * up. Undefined inside a list, where the structure has nothing to suggest.
   */
  private parentPath(
    lines: string[],
    line: number,
    indent: number,
  ): string[] | undefined {
    const path: string[] = [];
    let within = indent;
    for (let index = line - 1; index >= 0 && within > 0; index--) {
      const text = lines[index];
      if (text.trim() === "" || text.trimStart().startsWith("#")) continue;
      const lineIndent = text.length - text.trimStart().length;
      if (lineIndent >= within) continue;
      if (text.trimStart().startsWith("-")) return undefined;
      const entry = KEY_LINE.exec(text);
      if (!entry) return undefined;
      path.unshift(this.unquoted(entry[2].trim()));
      within = lineIndent;
    }
    return path;
  }

  private unquoted(key: string): string {
    return key.replace(/^(["'])(.*)\1$/, "$2");
  }

  private typedRange(position: Position, partial: string): Range {
    return {
      start: {
        line: position.line,
        character: position.character - partial.length,
      },
      end: position,
    };
  }
}
