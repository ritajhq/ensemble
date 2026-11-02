const PACKAGE_HEADER = /^\[\[package\]\]$/m;
const NAME = /^name = "(.+)"$/m;
const VERSION = /^version = "(.+)"$/m;

/** A `Cargo.lock`'s text: a header, then one `[[package]]` block per locked package. */
export class Lockfile {
  constructor(private readonly text: string) {}

  /**
   * This lockfile with every package of `other` it doesn't lock yet. Cargo
   * drops what the workspace turns out not to use the next time it reads the
   * result, and prefers what's locked for the rest, so an app's pins survive
   * joining a workspace.
   */
  withPackagesOf(other: Lockfile): Lockfile {
    const [header, ...blocks] = this.text.split(PACKAGE_HEADER);
    const known = new Set(blocks.map(Lockfile.identity));
    const added = other.text.split(PACKAGE_HEADER).slice(1)
      .filter((block) => !known.has(Lockfile.identity(block)));
    const merged = [...blocks, ...added]
      .map((block) => `[[package]]\n${block.trim()}\n`)
      .join("\n");
    return new Lockfile(`${header}${merged}`);
  }

  toString(): string {
    return this.text;
  }

  private static identity(block: string): string {
    return `${block.match(NAME)?.[1]} ${block.match(VERSION)?.[1]}`;
  }
}
