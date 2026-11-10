/** One step down a manifest: a mapping key, or a list index. */
export type PathSegment = string | number;

/**
 * One thing wrong with a manifest, at the node it's about: `path` runs from
 * the manifest's root (`["deploy", "compute", "api", "replicas"]`), so an
 * editor can put the message on that node's line. `message` is the sentence
 * `ens` prints, naming the path in its own words.
 */
export interface Problem {
  readonly path: readonly PathSegment[];
  readonly message: string;
}

/**
 * Where a node sits in a manifest, together with the name messages give it.
 * The parser names nodes from the manifest's root (`manifest.deploy.compute.api`);
 * resource checks name them from the resource (`compute.api.env.URL`). Both
 * point at the same node, which is what `segments` holds.
 */
export class ManifestPath {
  private constructor(
    readonly segments: readonly PathSegment[],
    private readonly shownFrom: number,
    private readonly root: string | undefined,
  ) {}

  /** The manifest itself, named `manifest`. */
  static manifest(): ManifestPath {
    return new ManifestPath([], 0, "manifest");
  }

  /** A `deploy:` entry, named `<category>.<name>` as resource checks name it. */
  static resource(category: string, name: string): ManifestPath {
    return new ManifestPath(["deploy", category, name], 1, undefined);
  }

  child(segment: PathSegment): ManifestPath {
    return new ManifestPath(
      [...this.segments, segment],
      this.shownFrom,
      this.root,
    );
  }

  /** A problem at this node. */
  problem(message: string): Problem {
    return { path: this.segments, message };
  }

  toString(): string {
    let text = this.root ?? "";
    for (const segment of this.segments.slice(this.shownFrom)) {
      if (typeof segment === "number") {
        text += `[${segment}]`;
        continue;
      }
      text += text === "" ? segment : `.${segment}`;
    }
    return text;
  }
}

/** The message an error carrying several problems prints: one per line. */
export function describeProblems(problems: readonly Problem[]): string {
  return problems.map((problem) => problem.message).join("\n");
}
