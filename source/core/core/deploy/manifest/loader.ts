import type { Workload } from "../workload.ts";
import type { Parser } from "./parser.ts";

/**
 * Reads a manifest file off disk and hands its text to a `Parser` — the one
 * piece of I/O around an otherwise pure parse (G6: filesystem access is an
 * adapter, never inlined into the pure core). The parser is a constructor
 * collaborator, not reached into statically, so this loader is testable with
 * a fake parser and no real filesystem.
 */
export class Loader {
  constructor(private readonly parser: Parser) {}

  async loadFile(path: string): Promise<Workload> {
    const text = await Deno.readTextFile(path);
    return this.parser.parse(text);
  }
}
