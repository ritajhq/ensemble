const SECTION = /^\s*\[([^\]]+)\]\s*(#.*)?$/;
const DEPENDENCIES_SECTION = /^(?:.*\.)?(?:dev-|build-)?dependencies$/;
const DEPENDENCY_TABLE = /^(?:.*\.)?(?:dev-|build-)?dependencies\.([\w-]+)$/;
const VERSION_LINE = /^(\s*version\s*=\s*)"[^"]*"/;
const INHERITED_VERSION = /^\s*version\s*\.\s*workspace\s*=/;
const DEPENDENCY_LINE = /^(\s*)([\w-]+)(\s*=\s*)(.*)$/;
const INLINE_PACKAGE = /\bpackage\s*=\s*"([^"]+)"/;
const INLINE_VERSION = /\bversion\s*=\s*"[^"]*"/;
const PACKAGE_LINE = /^\s*package\s*=\s*"([^"]+)"/;

/**
 * A `Cargo.toml`'s text, edited a line at a time so a release leaves its
 * comments and formatting alone: Deno's TOML library would rewrite the file.
 */
export class Manifest {
  constructor(private readonly text: string) {}

  /** The text with `[package]`'s version set to `version`. */
  withVersion(version: string): string {
    let section = "";
    let stamped = false;
    const lines = this.text.split("\n").map((line) => {
      section = line.match(SECTION)?.[1] ?? section;
      if (section !== "package") return line;
      if (INHERITED_VERSION.test(line)) {
        throw new Error(
          "A crate inheriting its version from the workspace can't be stamped on its own.",
        );
      }
      if (!VERSION_LINE.test(line)) return line;
      stamped = true;
      return line.replace(VERSION_LINE, `$1"${version}"`);
    });
    if (!stamped) throw new Error("This manifest has no [package] version.");
    return lines.join("\n");
  }

  /** The text with each dependency on one of `names` that states a version requiring `version` instead. A path dependency stating none stays as it is. */
  repinned(names: readonly string[], version: string): string {
    const lines = this.text.split("\n");
    let section = "";
    let table: { package: string; versionLine?: number } | undefined;

    const closeTable = () => {
      if (table?.versionLine === undefined) return;
      if (!names.includes(table.package)) return;
      lines[table.versionLine] = lines[table.versionLine].replace(
        VERSION_LINE,
        `$1"${version}"`,
      );
    };

    lines.forEach((line, index) => {
      const opened = line.match(SECTION)?.[1];
      if (opened !== undefined) {
        closeTable();
        section = opened;
        const dependency = opened.match(DEPENDENCY_TABLE)?.[1];
        table = dependency ? { package: dependency } : undefined;
        return;
      }
      if (table) {
        table.package = line.match(PACKAGE_LINE)?.[1] ?? table.package;
        if (VERSION_LINE.test(line)) table.versionLine = index;
        return;
      }
      if (!DEPENDENCIES_SECTION.test(section)) return;
      lines[index] = Manifest.repinLine(line, names, version);
    });
    closeTable();
    return lines.join("\n");
  }

  private static repinLine(
    line: string,
    names: readonly string[],
    version: string,
  ): string {
    const match = line.match(DEPENDENCY_LINE);
    if (!match) return line;
    const [, indent, key, equals, value] = match;
    const name = value.match(INLINE_PACKAGE)?.[1] ?? key;
    if (!names.includes(name)) return line;
    if (value.startsWith('"')) {
      return `${indent}${key}${equals}"${version}"`;
    }
    return line.replace(INLINE_VERSION, `version = "${version}"`);
  }
}
