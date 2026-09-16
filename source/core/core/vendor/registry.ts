import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import type { Entry } from "./entry.ts";

const LOCKFILE_NAME = "vendor.lock.yml";

interface StoredEntry {
  repo: string;
  ref: string;
}

/** The vendoring lockfile, as a port — one row per vendored path, `{ repo, ref }`. */
export interface Registry {
  register(entry: Entry): Promise<void>;
  entryFor(path: string): Promise<Entry | undefined>;
  all(): Promise<Entry[]>;
}

/**
 * File-backed `Registry`: a small YAML map keyed by vendored path, tracked at
 * `.ensemble/vendor.lock.yml`. The vendored checkout itself is never
 * committed here — registering a path also appends it to the outer repo's
 * `.gitignore` (once), so its contents live in their own git history instead
 * of as committed file contents in this tree.
 */
export class FileRegistry implements Registry {
  constructor(private readonly repoRoot: string) {}

  private get lockfilePath(): string {
    return join(this.repoRoot, ".ensemble", LOCKFILE_NAME);
  }

  private async readAll(): Promise<Record<string, StoredEntry>> {
    if (!await exists(this.lockfilePath, { isFile: true })) return {};
    const parsed = parseYaml(await Deno.readTextFile(this.lockfilePath));
    return (parsed as Record<string, StoredEntry> | null) ?? {};
  }

  private async writeAll(entries: Record<string, StoredEntry>): Promise<void> {
    await Deno.writeTextFile(this.lockfilePath, stringifyYaml(entries));
  }

  private async ignorePath(path: string): Promise<void> {
    const gitignorePath = join(this.repoRoot, ".gitignore");
    const existing = await exists(gitignorePath, { isFile: true })
      ? await Deno.readTextFile(gitignorePath)
      : "";
    if (existing.split("\n").includes(path)) return;
    const withTrailingNewline = existing.length > 0 && !existing.endsWith("\n")
      ? `${existing}\n`
      : existing;
    await Deno.writeTextFile(gitignorePath, `${withTrailingNewline}${path}\n`);
  }

  async register(entry: Entry): Promise<void> {
    const entries = await this.readAll();
    entries[entry.path] = { repo: entry.repo, ref: entry.ref };
    await this.writeAll(entries);
    await this.ignorePath(entry.path);
  }

  async entryFor(path: string): Promise<Entry | undefined> {
    const stored = (await this.readAll())[path];
    return stored ? { ...stored, path } : undefined;
  }

  async all(): Promise<Entry[]> {
    return Object.entries(await this.readAll()).map(([path, stored]) => ({
      ...stored,
      path,
    }));
  }
}
