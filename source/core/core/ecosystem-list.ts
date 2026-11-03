const KEY_LINE = /^ecosystems:/;
const KEY_COMMENT = /^ecosystems:[ \t]*(#.*)$/;
const ITEM_LINE = /^(\s*)-[ \t]+["']?([^\s"'#]+)["']?[ \t]*(#.*)?$/;
const CONTINUES_BLOCK = /^(\s+\S|-([ \t]|$))/;
const DEFAULT_INDENT = "  ";

/**
 * The `ecosystems:` entry of a `config.yaml`'s text, edited in place: every
 * other line, comments and blank lines included, stays as written, as does
 * the line of each ecosystem that stays listed.
 */
export class EcosystemList {
  constructor(private readonly text: string) {}

  /** This text with `ecosystems:` listing `ecosystems`, appended if the file has no such entry yet. */
  replacedWith(ecosystems: readonly string[]): string {
    const lines = this.text.split("\n");
    const start = lines.findIndex((line) => KEY_LINE.test(line));
    if (start === -1) return this.appended(ecosystems);
    const end = EcosystemList.endOfEntry(lines, start);
    const kept = new Map<string, string>();
    for (const line of lines.slice(start + 1, end + 1)) {
      const name = line.match(ITEM_LINE)?.[2];
      if (name !== undefined) kept.set(name, line);
    }
    const indent = lines.slice(start + 1, end + 1)
      .map((line) => line.match(ITEM_LINE)?.[1])
      .find((found) => found !== undefined) ?? DEFAULT_INDENT;
    const comment = lines[start].match(KEY_COMMENT)?.[1];
    const entry = [
      `ecosystems:${ecosystems.length === 0 ? " []" : ""}${
        comment ? ` ${comment}` : ""
      }`,
      ...ecosystems.map((name) => kept.get(name) ?? `${indent}- ${name}`),
    ];
    lines.splice(start, end - start + 1, ...entry);
    return lines.join("\n");
  }

  private appended(ecosystems: readonly string[]): string {
    const entry = ecosystems.length === 0
      ? "ecosystems: []\n"
      : `ecosystems:\n${
        ecosystems.map((name) => `${DEFAULT_INDENT}- ${name}\n`).join("")
      }`;
    if (this.text === "") return entry;
    return `${this.text}${this.text.endsWith("\n") ? "" : "\n"}${entry}`;
  }

  /** The last line that belongs to the entry starting at `start`: the comments and blank lines after it are the next entry's. */
  private static endOfEntry(lines: readonly string[], start: number): number {
    let end = start;
    for (let index = start + 1; index < lines.length; index++) {
      if (CONTINUES_BLOCK.test(lines[index])) end = index;
      else if (lines[index].trim() !== "" && !lines[index].startsWith("#")) {
        break;
      }
    }
    return end;
  }
}
