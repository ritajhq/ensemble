import { dirname, join, relative } from "@std/path";
import { ensureDir, exists } from "@std/fs";

const CONFIG_FILES = ["deno.json", "deno.jsonc"] as const;

/** Where the project's generated config and shared settings live, under its root. */
const ECOSYSTEM_DIRECTORY = join(".ensemble", "ecosystems", "deno");

/** The directory members are relative to, found from anywhere inside it: the project's root, known by its generated config or by a `deno.json` declaring the workspace. */
export class WorkspaceRoot {
  async above(start: string): Promise<string> {
    for (let dir = start;; dir = dirname(dir)) {
      if (await this.declaresWorkspace(dir)) return dir;
      const generated = join(dir, ECOSYSTEM_DIRECTORY, "deno.json");
      if (await exists(generated, { isFile: true })) return dir;
      if (dir === dirname(dir)) break;
    }
    throw new Error(`${start} is not inside a Deno workspace.`);
  }

  private async declaresWorkspace(dir: string): Promise<boolean> {
    const path = join(dir, "deno.json");
    if (!await exists(path, { isFile: true })) return false;
    const config = JSON.parse(await Deno.readTextFile(path));
    return config.workspace !== undefined;
  }
}

/**
 * Where a ship's lockfile is kept: with the project's other Deno files, or
 * beside the ship in a project whose workspace root is a `deno.json` of its own.
 */
export async function shipLockfile(
  root: string,
  ship: string,
  name: string,
): Promise<string> {
  return await exists(join(root, "deno.json"), { isFile: true })
    ? join(ship, "deno.lock")
    : join(root, ECOSYSTEM_DIRECTORY, "ships", name, "deno.lock");
}

/**
 * The workspace members a program actually reaches. A member is the nearest
 * directory above one of the program's files that holds a Deno config, as
 * the workspace's own `deno.json` lists them (`source/apps/**`, ...).
 */
export class WorkspaceMembers {
  constructor(private readonly root: string) {}

  /** Member directories, relative to the root and sorted, that own at least one of `files`. Files outside the root (the JSR and npm caches) belong to no member and are ignored. */
  async reachedBy(files: readonly string[]): Promise<string[]> {
    const members = new Map<string, string>();
    for (const file of files) {
      if (!this.within(file)) continue;
      const member = await this.memberOf(dirname(file), members);
      members.set(dirname(file), member);
    }
    return [...new Set(members.values())].sort();
  }

  private within(file: string): boolean {
    const path = relative(this.root, file);
    return !path.startsWith("..") && !path.split("/").includes("node_modules");
  }

  private async memberOf(
    start: string,
    known: ReadonlyMap<string, string>,
  ): Promise<string> {
    for (let dir = start; dir !== this.root; dir = dirname(dir)) {
      const cached = known.get(dir);
      if (cached) return cached;
      if (await this.holdsConfig(dir)) return relative(this.root, dir);
    }
    throw new Error(
      `${start} is under the workspace root but in no workspace member, so it cannot be staged with its own lockfile.`,
    );
  }

  private async holdsConfig(dir: string): Promise<boolean> {
    for (const name of CONFIG_FILES) {
      if (await exists(join(dir, name), { isFile: true })) return true;
    }
    return false;
  }
}

/**
 * A workspace of its own for one compiled program: the root's config, with
 * only the members the program reaches, symlinked in at the same relative
 * paths. `deno compile` embeds every npm package the workspace's lockfile
 * knows, whether the program imports it or not, so compiling in the whole
 * repo ships every npm dependency of every app and kit. Here the lockfile,
 * which is committed (see `shipLockfile`), holds only what the program resolves.
 */
export class StagedWorkspace {
  constructor(
    private readonly root: string,
    private readonly directory: string,
    private readonly lockfile: string,
  ) {}

  /** Where `file` of the real workspace is, seen from the staged one. */
  stagedPath(file: string): string {
    return join(this.directory, relative(this.root, file));
  }

  get stagedDirectory(): string {
    return this.directory;
  }

  async stage(members: readonly string[]): Promise<void> {
    await ensureDir(this.directory);
    for (const member of members) await this.link(member);
    await Deno.writeTextFile(
      join(this.directory, "deno.json"),
      JSON.stringify(await this.config(members), null, 2) + "\n",
    );
    if (await exists(this.lockfile, { isFile: true })) {
      await Deno.copyFile(this.lockfile, join(this.directory, "deno.lock"));
    }
  }

  /**
   * Keeps what the staged workspace resolved: created the first time, rewritten
   * when a dependency changed. Its `workspace` section is left out: Deno derives
   * that from the manifests on every run, and a release moving a member's pin
   * would otherwise change this file after the release's commit was made.
   */
  async keepLockfile(): Promise<void> {
    const resolved = join(this.directory, "deno.lock");
    if (!await exists(resolved, { isFile: true })) return;
    const { workspace: _workspace, ...pinned } = JSON.parse(
      await Deno.readTextFile(resolved),
    );
    const content = JSON.stringify(pinned, null, 2) + "\n";
    const current = await exists(this.lockfile, { isFile: true })
      ? await Deno.readTextFile(this.lockfile)
      : undefined;
    if (content === current) return;
    await ensureDir(dirname(this.lockfile));
    await Deno.writeTextFile(this.lockfile, content);
  }

  private async link(member: string): Promise<void> {
    const link = join(this.directory, member);
    await ensureDir(dirname(link));
    await Deno.remove(link).catch(() => undefined);
    await Deno.symlink(join(this.root, member), link);
  }

  private async config(members: readonly string[]) {
    const rootConfig = JSON.parse(await Deno.readTextFile(await this.shared()));
    const { tasks: _tasks, workspace: _workspace, ...kept } = rootConfig;
    return { ...kept, workspace: members.map((member) => `./${member}`) };
  }

  /** What the staged workspace inherits: a root `deno.json`, or the shared settings the generated config starts from, never that config's own import map. */
  private async shared(): Promise<string> {
    const atRoot = join(this.root, "deno.json");
    if (await exists(atRoot, { isFile: true })) return atRoot;
    return join(this.root, ECOSYSTEM_DIRECTORY, "settings.json");
  }
}
