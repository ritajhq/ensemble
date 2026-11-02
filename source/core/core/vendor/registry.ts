import { dirname, join, relative } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import type { Entry } from "./entry.ts";

const LOCKFILE_NAME = "vendor.lock.yml";

interface StoredEntry {
  repo: string;
  ref: string;
}

interface IgnoreRule {
  file: string;
  line: string;
}

/** The vendoring lockfile, as a port — one row per vendored path, `{ repo, ref }`. */
export interface Registry {
  register(entry: Entry): Promise<void>;
  /** Forgets a vendored path — the inverse of `register`, lockfile row and `.gitignore` line both. */
  unregister(path: string): Promise<void>;
  entryFor(path: string): Promise<Entry | undefined>;
  all(): Promise<Entry[]>;
}

/**
 * File-backed `Registry`: a small YAML map keyed by vendored path, tracked at
 * `.ensemble/vendor.lock.yml`. The vendored checkout itself is never
 * committed here — registering a path also adds it to a `.gitignore` (once),
 * so its contents live in their own git history instead of as committed file
 * contents in this tree. That's `.ensemble/.gitignore` for anything under
 * `.ensemble`. A `.gitignore` only reaches the folders beneath it, so anything
 * else gets one beside it, which goes away with the last path it lists.
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

  private ignoreRuleFor(path: string): IgnoreRule {
    const directory = path.startsWith(".ensemble/")
      ? ".ensemble"
      : dirname(path);
    return {
      file: join(this.repoRoot, directory, ".gitignore"),
      line: `/${relative(directory, path)}`,
    };
  }

  /** Projects vendored before rules moved out of the root listed the bare path there. */
  private rootRuleFor(path: string): IgnoreRule {
    return { file: join(this.repoRoot, ".gitignore"), line: path };
  }

  private async removeRule({ file, line }: IgnoreRule): Promise<void> {
    if (!await exists(file, { isFile: true })) return;
    const lines = (await Deno.readTextFile(file)).split("\n");
    if (!lines.includes(line)) return;
    const kept = lines.filter((other) => other !== line).join("\n");
    if (kept.trim().length === 0) return await Deno.remove(file);
    await Deno.writeTextFile(file, kept);
  }

  private async addRule({ file, line }: IgnoreRule): Promise<void> {
    const existing = await exists(file, { isFile: true })
      ? await Deno.readTextFile(file)
      : "";
    if (existing.split("\n").includes(line)) return;
    const withTrailingNewline = existing.length > 0 && !existing.endsWith("\n")
      ? `${existing}\n`
      : existing;
    await ensureDir(dirname(file));
    await Deno.writeTextFile(file, `${withTrailingNewline}${line}\n`);
  }

  async register(entry: Entry): Promise<void> {
    const entries = await this.readAll();
    entries[entry.path] = { repo: entry.repo, ref: entry.ref };
    await this.writeAll(entries);
    await this.addRule(this.ignoreRuleFor(entry.path));
    await this.removeRule(this.rootRuleFor(entry.path));
  }

  async unregister(path: string): Promise<void> {
    const entries = await this.readAll();
    delete entries[path];
    await this.writeAll(entries);
    await this.removeRule(this.ignoreRuleFor(path));
    await this.removeRule(this.rootRuleFor(path));
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
