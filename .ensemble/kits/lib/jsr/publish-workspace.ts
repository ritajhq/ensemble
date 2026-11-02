import { basename, dirname, join, relative } from "@std/path";
import { copy, ensureDir, exists, expandGlob } from "@std/fs";
import * as KitSdk from "@ensemble/kit-sdk";

const JSR_NAME = /^jsr:(@[^/@]+\/[^/@]+)/;

interface Member {
  readonly directory: string;
  readonly imports: Record<string, string>;
}

/**
 * Where `deno publish` runs for a library in a project with no workspace root.
 * It needs one to resolve the library's siblings from disk, so that publishing
 * them in order doesn't depend on the registry having caught up: a copy of the
 * library and what it reaches, under `.ensemble/cache`, with its own root.
 */
export class PublishWorkspace {
  constructor(private readonly libRoot: string) {}

  /** The directory to publish from. In a project with a root `deno.json`, that's simply the library's own. */
  async prepare(): Promise<string> {
    const repoRoot = await KitSdk.findRepoRoot(this.libRoot);
    if (await exists(join(repoRoot, "deno.json"), { isFile: true })) {
      return this.libRoot;
    }

    const members = await this.reached(await this.named(repoRoot));
    const scratch = join(
      repoRoot,
      ".ensemble",
      "cache",
      "jsr",
      basename(this.libRoot),
    );
    await Deno.remove(scratch, { recursive: true }).catch(() => undefined);
    const paths = members.map((member) => relative(repoRoot, member));
    for (const path of paths) {
      await ensureDir(dirname(join(scratch, path)));
      await copy(join(repoRoot, path), join(scratch, path), {
        preserveTimestamps: true,
      });
    }
    await Deno.writeTextFile(
      join(scratch, "deno.json"),
      `${
        JSON.stringify(
          {
            ...await this.settings(repoRoot),
            workspace: paths.map((path) => `./${path}`),
          },
          null,
          2,
        )
      }\n`,
    );
    return join(scratch, relative(repoRoot, this.libRoot));
  }

  private async named(repoRoot: string): Promise<Map<string, Member>> {
    const members = new Map<string, Member>();
    for (const root of ["source/core", "source/libs"]) {
      const manifests = expandGlob(`${root}/*/deno.json`, { root: repoRoot });
      for await (const manifest of manifests) {
        const parsed = JSON.parse(await Deno.readTextFile(manifest.path));
        if (typeof parsed.name !== "string") continue;
        members.set(parsed.name, {
          directory: dirname(manifest.path),
          imports: parsed.imports ?? {},
        });
      }
    }
    return members;
  }

  /** The library's directory, and those of the siblings it reaches through its imports. */
  private async reached(
    named: ReadonlyMap<string, Member>,
  ): Promise<string[]> {
    const own = JSON.parse(
      await Deno.readTextFile(join(this.libRoot, "deno.json")),
    );
    const reached = new Set([this.libRoot]);
    const pending = [own.imports ?? {}] as Record<string, string>[];
    for (let imports = pending.pop(); imports; imports = pending.pop()) {
      for (const target of Object.values(imports)) {
        const name = target.match(JSR_NAME)?.[1];
        const member = name ? named.get(name) : undefined;
        if (!member || reached.has(member.directory)) continue;
        reached.add(member.directory);
        pending.push(member.imports);
      }
    }
    return [...reached];
  }

  private async settings(repoRoot: string): Promise<Record<string, unknown>> {
    const path = join(repoRoot, ".ensemble/ecosystems/deno/settings.json");
    if (!await exists(path, { isFile: true })) return {};
    const { tasks: _tasks, ...kept } = JSON.parse(
      await Deno.readTextFile(path),
    );
    return kept;
  }
}
