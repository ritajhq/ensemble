import { basename, dirname, join, SEPARATOR } from "@std/path";
import { exists } from "@std/fs";
import { Delegate, type Emitter } from "@duesabati/evento";
import { readMemberPatterns } from "./workspace-members.ts";

const CONFIG_FILE_NAMES = new Set(["deno.json", "deno.jsonc"]);

// Editors save in bursts (write temp, rename, chmod) and a new member arrives
// as a mkdir followed by its deno.json — one notification per burst.
const SETTLE_DELAY_MS = 300;

/**
 * The repo's Deno workspace configuration: the root `deno.json` and every
 * member's own `deno.json`. `deno bundle --watch` reads all of these once at
 * startup and never again (it watches the module graph, not the config), so a
 * new member or a new import-map entry stays unresolvable until it restarts —
 * `OnChange` tells a build kit when that restart is due.
 */
export class WorkspaceConfig {
  private readonly change = new Delegate<[]>();
  private pending?: number;

  constructor(private readonly repoRoot: string) {}

  /** Fires once per settled burst of edits to, or additions/removals of, any workspace `deno.json`. */
  get OnChange(): Emitter<[]> {
    return this.change;
  }

  /** Watches until the process exits. Members matched by a glob added to the root `deno.json` later are only watched from the next start. */
  async watch(): Promise<void> {
    const watcher = Deno.watchFs(await this.watchedPaths(), {
      recursive: true,
    });
    for await (const event of watcher) {
      if (event.kind === "access") continue;
      if (!event.paths.some(isConfigFile)) continue;
      this.notify();
    }
  }

  private notify(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.change.Invoke(), SETTLE_DELAY_MS);
  }

  /** The root `deno.json` plus the static prefix of every `workspace` glob (`source/core/**` → `source/core`). */
  private async watchedPaths(): Promise<string[]> {
    const rootConfig = join(this.repoRoot, "deno.json");
    const members = await readMemberPatterns(this.repoRoot);
    const bases = members.map((pattern) =>
      join(this.repoRoot, staticPrefix(pattern))
    );
    const existing = [];
    for (const path of new Set([rootConfig, ...bases])) {
      if (await exists(path)) existing.push(path);
    }
    return existing;
  }
}

function isConfigFile(path: string): boolean {
  return CONFIG_FILE_NAMES.has(basename(path));
}

function staticPrefix(pattern: string): string {
  const segments = pattern.replace(/^\.\//, "").split(/[\\/]/);
  const firstGlob = segments.findIndex((segment) => /[*?[{]/.test(segment));
  const literal = firstGlob === -1 ? segments : segments.slice(0, firstGlob);
  // A literal member path names the member's own directory; watching its
  // parent also catches the member being removed and re-created.
  return firstGlob === -1
    ? dirname(literal.join(SEPARATOR))
    : literal.join(SEPARATOR);
}
