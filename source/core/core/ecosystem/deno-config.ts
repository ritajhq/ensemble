import { dirname, join, relative, SEPARATOR } from "@std/path";

/** One package's `deno.json`, as the generated config needs it. */
export interface DenoManifest {
  readonly path: string;
  readonly contents: {
    name?: unknown;
    exports?: unknown;
    imports?: Record<string, string>;
    exclude?: string[];
  };
}

const JSR_SPECIFIER = /^jsr:(@[^/@]+\/[^/@]+)(?:@[^/]+)?(\/.*)?$/;

/** A named package in this repository: what its name and subpaths resolve to. */
class LocalPackage {
  constructor(
    readonly directory: string,
    /** Export key without its leading `.`, so `""` is the package itself → the absolute file. */
    readonly exports: ReadonlyMap<string, string>,
  ) {}

  static from(manifest: DenoManifest): LocalPackage {
    const raw = manifest.contents.exports;
    const declared: Record<string, string> = typeof raw === "string"
      ? { ".": raw }
      : (raw as Record<string, string> | undefined) ?? {};
    const directory = dirname(manifest.path);
    return new LocalPackage(
      directory,
      new Map(
        Object.entries(declared).map((
          [key, file],
        ) => [key.slice(1), join(directory, file)]),
      ),
    );
  }
}

/**
 * The one `deno.json` a project's packages resolve through, generated from their
 * own manifests so that no workspace root has to sit above them: Deno refuses
 * members outside its root, and a root in `source/` or the repository's root is
 * exactly what `.ensemble/ecosystems/deno` exists to avoid. Each package gets an
 * import-map scope holding its own `imports`, with those naming another package
 * here pointed at its files, which is what a workspace would have done.
 */
export class DenoConfig {
  private readonly packages: ReadonlyMap<string, LocalPackage>;

  constructor(
    private readonly directory: string,
    private readonly manifests: readonly DenoManifest[],
    private readonly settings: Record<string, unknown>,
  ) {
    const packages = new Map<string, LocalPackage>();
    for (const manifest of manifests) {
      const name = manifest.contents.name;
      if (typeof name !== "string") continue;
      packages.set(name, LocalPackage.from(manifest));
    }
    this.packages = packages;
  }

  render(): string {
    const config = {
      ...this.settings,
      imports: {
        ...this.settings.imports as Record<string, string> | undefined,
        ...sorted(this.packageImports()),
      },
      scopes: sorted(this.scopes()),
      lock: "./deno.lock",
      ...this.exclusions(),
    };
    return `${JSON.stringify(config, null, 2)}\n`;
  }

  private packageImports(): Record<string, string> {
    const imports: Record<string, string> = {};
    for (const [name, found] of this.packages) {
      Object.assign(imports, this.entriesFor(name, found));
    }
    return imports;
  }

  private scopes(): Record<string, Record<string, string>> {
    const scopes: Record<string, Record<string, string>> = {};
    for (const manifest of this.manifests) {
      const directory = dirname(manifest.path);
      const scope: Record<string, string> = {};
      for (
        const [specifier, target] of Object.entries(
          manifest.contents.imports ?? {},
        )
      ) {
        Object.assign(scope, this.resolve(specifier, target, directory));
      }
      scopes[`${this.relative(directory)}/`] = sorted(scope);
    }
    return scopes;
  }

  private resolve(
    specifier: string,
    target: string,
    directory: string,
  ): Record<string, string> {
    if (target.startsWith("./") || target.startsWith("../")) {
      const trailing = target.endsWith("/") ? "/" : "";
      return {
        [specifier]: `${this.relative(join(directory, target))}${trailing}`,
      };
    }
    const match = target.match(JSR_SPECIFIER);
    const local = match ? this.packages.get(match[1]) : undefined;
    if (!match || !local) return { [specifier]: target };
    const subpath = match[2];
    if (subpath === undefined) return this.entriesFor(specifier, local);
    const file = local.exports.get(subpath);
    return {
      [specifier]: this.relative(file ?? join(local.directory, subpath)),
    };
  }

  /** `name` and its subpaths: each export exactly, anything else as a path inside the package. */
  private entriesFor(
    name: string,
    local: LocalPackage,
  ): Record<string, string> {
    const entries: Record<string, string> = {
      [`${name}/`]: `${this.relative(local.directory)}/`,
    };
    for (const [subpath, file] of local.exports) {
      entries[`${name}${subpath}`] = this.relative(file);
    }
    return entries;
  }

  private exclusions(): { exclude?: string[] } {
    const excluded = this.manifests.flatMap((manifest) =>
      (manifest.contents.exclude ?? []).map((path) =>
        this.relative(join(dirname(manifest.path), path))
      )
    );
    return excluded.length > 0 ? { exclude: excluded.sort() } : {};
  }

  private relative(path: string): string {
    return relative(this.directory, path).replaceAll(SEPARATOR, "/");
  }
}

function sorted<Value>(record: Record<string, Value>): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  );
}
