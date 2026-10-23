import { dirname, fromFileUrl, join, relative } from "@std/path";
import { ensureDir, exists } from "@std/fs";

const CONFIG_FILES = ["deno.json", "deno.jsonc"] as const;

/** The directory whose `deno.json` declares the workspace, found from anywhere inside it. */
export class WorkspaceRoot {
  async above(start: string): Promise<string> {
    for (let dir = start;; dir = dirname(dir)) {
      if (await this.declaresWorkspace(dir)) return dir;
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
 * repo ships every npm dependency of every app and kit. Here the lockfile
 * (`deno.lock`, kept beside the program's ship and committed) holds only
 * what the program resolves.
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

  /** Keeps the lockfile the staged workspace resolved: created the first time, rewritten when a dependency changed. */
  async keepLockfile(): Promise<void> {
    const resolved = join(this.directory, "deno.lock");
    if (!await exists(resolved, { isFile: true })) return;
    const content = await Deno.readTextFile(resolved);
    const current = await exists(this.lockfile, { isFile: true })
      ? await Deno.readTextFile(this.lockfile)
      : undefined;
    if (content === current) return;
    await Deno.writeTextFile(this.lockfile, content);
  }

  private async link(member: string): Promise<void> {
    const link = join(this.directory, member);
    await ensureDir(dirname(link));
    await Deno.remove(link).catch(() => undefined);
    await Deno.symlink(join(this.root, member), link);
  }

  private async config(members: readonly string[]) {
    const rootConfig = JSON.parse(
      await Deno.readTextFile(join(this.root, "deno.json")),
    );
    const { tasks: _tasks, workspace: _workspace, ...kept } = rootConfig;
    return { ...kept, workspace: members.map((member) => `./${member}`) };
  }
}
