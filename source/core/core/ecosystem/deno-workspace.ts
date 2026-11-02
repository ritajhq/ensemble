import { join } from "@std/path";
import { ensureDir, exists, expandGlob } from "@std/fs";
import type { Link, Package, StampTarget } from "./package.ts";

interface DenoJson {
  name?: unknown;
  version?: unknown;
  exports?: unknown;
  imports?: Record<string, string>;
  [key: string]: unknown;
}

const INDEX_TS_TEMPLATE = `export {};\n`;

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
 * The repo's Deno workspace: its root `deno.json`, either form of `workspace`
 * Deno accepts (a list, or `{ members: [...] }`), and each member's own
 * `deno.json`.
 */
export class DenoWorkspace {
  constructor(private readonly repoRoot: string) {}

  /** Writes the root `deno.json` a new project's members resolve each other through. */
  async initialize(): Promise<void> {
    await writeDenoJson(join(this.repoRoot, "deno.json"), {
      workspace: [
        "source/apps/**",
        "source/core/**",
        "source/libs/**",
        ".ensemble/kits/**",
      ],
    });
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

  /** Absolute path of every member's `deno.json`, the published core libs among them. */
  async manifests(): Promise<string[]> {
    const manifests: string[] = [];
    for (const pattern of await this.memberPatterns()) {
      const configs = expandGlob(join(pattern, "deno.json"), {
        root: this.repoRoot,
        exclude: ["**/node_modules/**"],
      });
      for await (const config of configs) manifests.push(config.path);
    }
    return manifests;
  }

  /**
   * Moves `targets` to `version` and repins every member that imports one of
   * them, returning the manifests it repinned so a release commit can carry
   * them too. All of it happens at once, before any kit runs: a kit resolves
   * the workspace's whole module graph just to start up, so it must never see
   * a member pinned to a version its target doesn't carry yet.
   */
  async stamp(
    version: string,
    targets: readonly StampTarget[],
  ): Promise<string[]> {
    await this.stampOwnVersions(version, targets);
    return await this.repinMembers(version, targets);
  }

  /** Writes a new member's `deno.json` and a stub `index.ts`. The workspace's globs already cover `directory`, so nothing else needs registering. */
  async scaffoldLibrary(directory: string, name: string): Promise<void> {
    await ensureDir(directory);
    await writeDenoJson(join(directory, "deno.json"), {
      name,
      version: "0.0.1",
      exports: "./index.ts",
    });
    await Deno.writeTextFile(join(directory, "index.ts"), INDEX_TS_TEMPLATE);
  }

  /**
   * The lockfile, which a release commit has to carry: stamping spawns a `deno
   * run` per lib kit, and each one resolves the workspace's module graph
   * against the new versions, which Deno writes straight into `deno.lock`.
   */
  async lockfiles(): Promise<string[]> {
    const lockfile = join(this.repoRoot, "deno.lock");
    return await exists(lockfile, { isFile: true }) ? [lockfile] : [];
  }

  /**
   * Writes `version` straight into every target's own `deno.json`, before any
   * lib kit subprocess runs — including that same library's own `stamp`. A lib
   * kit invocation always resolves its full module graph (via
   * `@ensemble/kit-sdk`) just to start up, and that graph reads every workspace
   * member's on-disk version; if the very first library's own subprocess ran
   * before this, it would see a workspace where `repinMembers` already repinned
   * its dependents to the new version but its own manifest still carries the
   * old one. Ordinarily redundant with what the `jsr` lib kit's own `stamp`
   * does to the same file, but not every lib kit stamps a `deno.json`, so this
   * can't replace the per-kit stamp step — only run ahead of it, for the sake
   * of workspace resolution alone.
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
   * Repins every member's `imports` that point at a target with a version, to
   * `version`. On 0.x a caret range never spans a minor, so once a core
   * library's workspace version moves past what a member still pins (e.g.
   * `^0.13.0` after the library bumped to `0.14.0`), Deno stops linking it
   * locally and falls back to whatever that version resolves to on the real
   * registry: an older release missing what the member uses, or, for a library
   * not yet published there, nothing at all. That holds for every member — the
   * core libraries themselves, whose lib kit subprocesses resolve their
   * siblings just to start up, but equally the apps packed and the kits run
   * later in the same release. Unversioned imports (`jsr:@ensemble/core`)
   * always link locally and are left alone.
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

  private async memberPatterns(): Promise<string[]> {
    const rootConfig = join(this.repoRoot, "deno.json");
    if (!await exists(rootConfig, { isFile: true })) return [];
    const parsed = JSON.parse(await Deno.readTextFile(rootConfig));
    const workspace = parsed?.workspace;
    const patterns = Array.isArray(workspace) ? workspace : workspace?.members;
    if (!Array.isArray(patterns)) return [];
    return patterns.filter((pattern: unknown) => typeof pattern === "string");
  }
}
