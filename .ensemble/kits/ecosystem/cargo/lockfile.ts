const PACKAGE_HEADER = /^\[\[package\]\]$/m;
const NAME = /^name = "(.+)"$/m;
const VERSION = /^version = "(.+)"$/m;
const SOURCE = /^source = "(.+)"$/m;

/** A `Cargo.lock`'s text: a header, then one `[[package]]` block per locked package. */
export class Lockfile {
  constructor(private readonly text: string) {}

  /**
   * This lockfile with every package of `other` it doesn't lock yet. Cargo
   * drops what the workspace turns out not to use the next time it reads the
   * result, and prefers what's locked for the rest, so an app's pins survive
   * joining a workspace.
   *
   * A pin never lowers what this lockfile already locks: an older release of a
   * fetched package that this one holds a newer compatible release of is left
   * out, and `other`'s dependencies on it point at the newer release instead.
   * Cargo still resolves the older one back in if the app's manifest
   * requires it.
   */
  withPackagesOf(other: Lockfile): Lockfile {
    const [header, ...blocks] = this.text.split(PACKAGE_HEADER);
    const known = new Set(blocks.map(Lockfile.identity));
    const superseding = new Map<string, string>();
    const added = other.text.split(PACKAGE_HEADER).slice(1)
      .filter((block) => {
        if (known.has(Lockfile.identity(block))) return false;
        const newer = Lockfile.newerCompatibleIn(blocks, block);
        if (newer === undefined) return true;
        superseding.set(Lockfile.identity(block), Lockfile.version(newer));
        return false;
      })
      .map((block) => Lockfile.dependingOnReplacements(block, superseding));
    const merged = [...blocks, ...added]
      .map((block) => `[[package]]\n${block.trim()}\n`)
      .join("\n");
    return new Lockfile(`${header}${merged}`);
  }

  toString(): string {
    return this.text;
  }

  private static identity(block: string): string {
    return `${Lockfile.name(block)} ${Lockfile.version(block)}`;
  }

  private static name(block: string): string | undefined {
    return block.match(NAME)?.[1];
  }

  private static version(block: string): string {
    return block.match(VERSION)?.[1] ?? "";
  }

  /** What a release may be raised to without breaking semver: its major, or its minor below 1.0. */
  private static compatibility(version: string): string {
    const [major, minor, patch] = version.split(/[.+-]/);
    if (major !== "0") return major;
    return minor !== "0" ? `0.${minor}` : `0.0.${patch}`;
  }

  /** The block among `blocks` that is a newer, compatible release of what `block` locks, from the same source. */
  private static newerCompatibleIn(
    blocks: readonly string[],
    block: string,
  ): string | undefined {
    const source = block.match(SOURCE)?.[1];
    if (source === undefined) return undefined;
    const version = Lockfile.version(block);
    return blocks.find((candidate) =>
      Lockfile.name(candidate) === Lockfile.name(block) &&
      candidate.match(SOURCE)?.[1] === source &&
      Lockfile.compatibility(Lockfile.version(candidate)) ===
        Lockfile.compatibility(version) &&
      Lockfile.isNewer(Lockfile.version(candidate), version)
    );
  }

  private static isNewer(version: string, than: string): boolean {
    const [release, other] = [version, than].map((text) =>
      text.split(/[-+]/)[0].split(".").map(Number)
    );
    const length = Math.max(release.length, other.length);
    for (let index = 0; index < length; index++) {
      const difference = (release[index] ?? 0) - (other[index] ?? 0);
      if (difference !== 0) return difference > 0;
    }
    return false;
  }

  /** `block` with its dependencies on a package that was left out pointing at the release that replaces it. */
  private static dependingOnReplacements(
    block: string,
    superseding: ReadonlyMap<string, string>,
  ): string {
    let rewritten = block;
    for (const [identity, version] of superseding) {
      const [name] = identity.split(" ");
      rewritten = rewritten.replaceAll(`"${identity}`, `"${name} ${version}`);
    }
    return rewritten;
  }
}
