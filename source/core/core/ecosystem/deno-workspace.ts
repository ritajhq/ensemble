import { join } from "@std/path";
import { ensureDir, exists, expandGlob } from "@std/fs";
import { DenoConfig, type DenoManifest } from "./deno-config.ts";
import type {
  Ecosystem,
  Invocation,
  Link,
  Package,
  StampTarget,
} from "./ecosystem.ts";

interface DenoJson {
  name?: unknown;
  version?: unknown;
  exports?: unknown;
  imports?: Record<string, string>;
  [key: string]: unknown;
}

const INDEX_TS_TEMPLATE = `export {};\n`;

/** Where a project's packages live. Kits are packages too: their imports resolve like anything else's. */
const MANIFEST_GLOBS = [
  "source/apps/**/deno.json",
  "source/core/**/deno.json",
  "source/libs/**/deno.json",
  ".ensemble/kits/**/deno.json",
];
const NEVER_PACKAGES = ["**/node_modules/**", "**/testdata/**"];

async function writeDenoJson(path: string, denoJson: object): Promise<void> {
  await Deno.writeTextFile(path, `${JSON.stringify(denoJson, null, 2)}\n`);
}

/**
 * A workspace member is linked (as opposed to an ordinary versioned external
 * dependency) via a bare, version-less `jsr:@scope/name` specifier — e.g.
 * `"@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk"` vs. an external dependency's
 * `"@std/path": "jsr:@std/path@1.1.6"`. The scope's own "@" is always the
 * first one, so a specifier with no version has exactly one "@" total.
 */
function linkTarget(target: string): string | undefined {
  if (!target.startsWith("jsr:")) return undefined;
  const rest = target.slice("jsr:".length);
  const atCount = (rest.match(/@/g) ?? []).length;
  return atCount === 1 ? rest : undefined;
}

/**
 * A project's Deno packages. Each keeps its own `deno.json`; everything else
 * lives in `.ensemble/ecosystems/deno`: `settings.json` for what's shared, like
 * `compilerOptions`, the `deno.json` generated from those (`DenoConfig`), and
 * `deno.lock`. A project with a `deno.json` at its repository's root predates
 * this and is left as it is: that file stays its workspace root.
 */
export class DenoWorkspace implements Ecosystem {
  private readonly directory: string;

  constructor(private readonly repoRoot: string) {
    this.directory = join(repoRoot, ".ensemble", "ecosystems", "deno");
  }

  async initialize(): Promise<void> {
    await ensureDir(this.directory);
    await writeDenoJson(join(this.directory, "settings.json"), {});
    await this.sync();
  }

  async sync(): Promise<void> {
    await this.regenerate();
  }

  /** The package whose `deno.json` sits directly in `directory`, which needn't be a workspace member yet. */
  async packageAt(directory: string): Promise<Package | undefined> {
    const path = join(directory, "deno.json");
    if (!await exists(path, { isFile: true })) return undefined;
    const denoJson = JSON.parse(await Deno.readTextFile(path)) as DenoJson;
    const links: Link[] = [];
    for (const [specifier, target] of Object.entries(denoJson.imports ?? {})) {
      const linked = linkTarget(target);
      if (linked !== undefined) links.push({ specifier, target: linked });
    }
    return {
      name: typeof denoJson.name === "string" ? denoJson.name : undefined,
      directory,
      links,
    };
  }

  /** Absolute path of every package's `deno.json`, the published core libs among them. */
  async manifests(): Promise<string[]> {
    return await this.isAtRoot()
      ? await this.rootMembers()
      : await this.glob(MANIFEST_GLOBS, NEVER_PACKAGES);
  }

  /**
   * Moves `targets` to `version` and repins every package that imports one of
   * them, returning the manifests it repinned so a release commit can carry
   * them too. All of it happens at once, before any kit runs: a kit resolves its
   * whole module graph just to start up, so it must never see a package pinned
   * to a version its target doesn't carry yet.
   */
  async stamp(
    version: string,
    targets: readonly StampTarget[],
  ): Promise<string[]> {
    await this.stampOwnVersions(version, targets);
    const changed = await this.repinMembers(version, targets);
    if (await this.regenerate()) changed.push(this.configPath());
    return changed;
  }

  /** Writes a new package's `deno.json` and a stub `index.ts`. */
  async scaffoldLibrary(directory: string, name: string): Promise<void> {
    await ensureDir(directory);
    await writeDenoJson(join(directory, "deno.json"), {
      name,
      version: "0.0.1",
      exports: "./index.ts",
    });
    await Deno.writeTextFile(join(directory, "index.ts"), INDEX_TS_TEMPLATE);
    await this.sync();
  }

  /**
   * The lockfile, which a release commit has to carry: stamping spawns a `deno
   * run` per lib kit, and each one may write what it resolves into `deno.lock`.
   */
  async lockfiles(): Promise<string[]> {
    const lockfile = await this.isAtRoot()
      ? join(this.repoRoot, "deno.lock")
      : join(this.directory, "deno.lock");
    return await exists(lockfile, { isFile: true }) ? [lockfile] : [];
  }

  /** `deno <subcommand>` run against the generated config, since a package's own folder no longer leads Deno to it. */
  async invocation(
    tool: string,
    args: readonly string[],
  ): Promise<Invocation | undefined> {
    if (tool !== "deno") return undefined;
    if (args.length === 0 || await this.isAtRoot()) return { args };
    const [subcommand, ...rest] = args;
    return { args: [subcommand, "--config", this.configPath(), ...rest] };
  }

  /** The flags pointing a `deno` command at this workspace's config, which a kit adds to anything it runs against the project's own code. */
  async configArgs(): Promise<string[]> {
    if (await this.isAtRoot()) return [];
    if (!await exists(this.configPath(), { isFile: true })) return [];
    return ["--config", this.configPath()];
  }

  private configPath(): string {
    return join(this.directory, "deno.json");
  }

  private async isAtRoot(): Promise<boolean> {
    return await exists(join(this.repoRoot, "deno.json"), { isFile: true });
  }

  /** Writes the generated config if it's out of date, reporting whether it was. */
  private async regenerate(): Promise<boolean> {
    if (await this.isAtRoot()) return false;
    const manifests: DenoManifest[] = [];
    for (const path of await this.manifests()) {
      const contents = JSON.parse(await Deno.readTextFile(path));
      manifests.push({ path, contents });
    }
    const rendered = new DenoConfig(
      this.directory,
      manifests.sort((a, b) => a.path < b.path ? -1 : 1),
      await this.settings(),
    ).render();
    const current = await exists(this.configPath(), { isFile: true })
      ? await Deno.readTextFile(this.configPath())
      : undefined;
    if (rendered === current) return false;
    await ensureDir(this.directory);
    await Deno.writeTextFile(this.configPath(), rendered);
    return true;
  }

  private async settings(): Promise<Record<string, unknown>> {
    const path = join(this.directory, "settings.json");
    if (!await exists(path, { isFile: true })) return {};
    return JSON.parse(await Deno.readTextFile(path));
  }

  /**
   * Writes `version` straight into every target's own `deno.json`, before any
   * lib kit subprocess runs — including that same library's own `stamp`. A lib
   * kit invocation always resolves its full module graph (via
   * `@ensemble/kit-sdk`) just to start up, and that graph reads every member's
   * on-disk version; if the very first library's own subprocess ran before
   * this, it would see a workspace where `repinMembers` already repinned its
   * dependents to the new version but its own manifest still carries the old
   * one. Ordinarily redundant with what the `jsr` lib kit's own `stamp` does to
   * the same file, but not every lib kit stamps a `deno.json`, so this can't
   * replace the per-kit stamp step — only run ahead of it, for the sake of
   * resolution alone.
   */
  private async stampOwnVersions(
    version: string,
    targets: readonly StampTarget[],
  ): Promise<void> {
    for (const { directory, name } of targets) {
      const path = join(directory, "deno.json");
      if (!await exists(path, { isFile: true })) continue;
      const denoJson = JSON.parse(await Deno.readTextFile(path)) as DenoJson;
      denoJson.name = name;
      denoJson.version = version;
      await writeDenoJson(path, denoJson);
    }
  }

  /**
   * Repins every package's `imports` that point at a target with a version, to
   * `version`. On 0.x a caret range never spans a minor, so once a core
   * library's version moves past what a member still pins (e.g. `^0.13.0` after
   * the library bumped to `0.14.0`), a workspace at the root stops linking it
   * locally and falls back to whatever that version resolves to on the real
   * registry, and either way a package published with that pin would ask for a
   * release it wasn't built against. Unversioned imports
   * (`jsr:@ensemble/core`) always link locally and are left alone.
   */
  private async repinMembers(
    version: string,
    targets: readonly StampTarget[],
  ): Promise<string[]> {
    const names = targets.map((target) => target.name);
    const repinned: string[] = [];
    for (const path of await this.manifests()) {
      const denoJson = JSON.parse(await Deno.readTextFile(path)) as DenoJson;
      const imports = denoJson.imports;
      if (!imports) continue;

      let changed = false;
      for (const [specifier, target] of Object.entries(imports)) {
        const dependency = names.find((name) =>
          target.startsWith(`jsr:${name}@`)
        );
        if (!dependency) continue;
        const pinned = `jsr:${dependency}@^${version}`;
        if (target === pinned) continue;
        imports[specifier] = pinned;
        changed = true;
      }
      if (!changed) continue;

      await writeDenoJson(path, denoJson);
      repinned.push(path);
    }
    return repinned;
  }

  private async rootMembers(): Promise<string[]> {
    const patterns = await this.memberPatterns();
    // A `!` pattern takes members back out, as it does for Deno itself.
    const excluded = patterns.filter((pattern) => pattern.startsWith("!"))
      .map((pattern) => pattern.slice(1));
    return await this.glob(
      patterns.filter((pattern) => !pattern.startsWith("!"))
        .map((pattern) => join(pattern, "deno.json")),
      ["**/node_modules/**", ...excluded],
    );
  }

  private async glob(
    patterns: readonly string[],
    exclude: readonly string[],
  ): Promise<string[]> {
    const manifests: string[] = [];
    for (const pattern of patterns) {
      const configs = expandGlob(pattern, {
        root: this.repoRoot,
        exclude: [...exclude],
      });
      for await (const config of configs) manifests.push(config.path);
    }
    return manifests;
  }

  private async memberPatterns(): Promise<string[]> {
    const parsed = JSON.parse(
      await Deno.readTextFile(join(this.repoRoot, "deno.json")),
    );
    const workspace = parsed?.workspace;
    const patterns = Array.isArray(workspace) ? workspace : workspace?.members;
    if (!Array.isArray(patterns)) return [];
    return patterns.filter((pattern: unknown) => typeof pattern === "string");
  }
}
