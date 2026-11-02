import { dirname, join } from "@std/path";
import { exists } from "@std/fs";
import { Ecosystems } from "@ensemble/core";

/** The `workspace` globs from a root `deno.json` — either form Deno accepts (a list, or `{ members: [...] }`) — or none, in a project without one. */
export async function readMemberPatterns(repoRoot: string): Promise<string[]> {
  const rootConfig = join(repoRoot, "deno.json");
  if (!await exists(rootConfig, { isFile: true })) return [];
  const parsed = JSON.parse(await Deno.readTextFile(rootConfig));
  const workspace = parsed?.workspace;
  const patterns = Array.isArray(workspace) ? workspace : workspace?.members;
  if (!Array.isArray(patterns)) return [];
  return patterns.filter((pattern: unknown) => typeof pattern === "string");
}

/** The flags pointing a `deno` command at the project's generated config, for a kit running one against the project's own code. Empty in a project with a root `deno.json`, which Deno finds by itself. */
export function denoConfigArgs(repoRoot: string): Promise<string[]> {
  return new Ecosystems.DenoWorkspace(repoRoot).configArgs();
}

/** One named workspace member: where it lives and what its `exports` map exposes. */
class Member {
  constructor(
    private readonly directory: string,
    private readonly exports: Record<string, string>,
  ) {}

  /** `subpath` as written after the package name (`"styles"`, `""` for the root) → absolute file, through `exports` first, then as a plain path inside the member. */
  async resolve(subpath: string): Promise<string | undefined> {
    const exported = this.exports[subpath ? `./${subpath}` : "."];
    if (exported) return join(this.directory, exported);
    if (!subpath) return undefined;
    const direct = join(this.directory, subpath);
    return await exists(direct, { isFile: true }) ? direct : undefined;
  }
}

/**
 * The repo's Deno workspace members by package name — what lets a tool that
 * doesn't speak Deno's own resolution (Tailwind's `@import`) still reach
 * `@scope/package/subpath` the same way a `.ts` import of it would.
 */
export class WorkspaceMembers {
  private constructor(private readonly byName: Map<string, Member>) {}

  static async load(repoRoot: string): Promise<WorkspaceMembers> {
    const byName = new Map<string, Member>();
    const manifests = await new Ecosystems.DenoWorkspace(repoRoot).manifests();
    for (const manifest of manifests) {
      const parsed = JSON.parse(await Deno.readTextFile(manifest));
      if (typeof parsed?.name !== "string") continue;
      byName.set(
        parsed.name,
        new Member(dirname(manifest), exportsMap(parsed.exports)),
      );
    }
    return new WorkspaceMembers(byName);
  }

  /** `@scope/package/subpath` → absolute file, or `undefined` when no member by that name exists (e.g. `tailwindcss`, an npm package). */
  resolve(specifier: string): Promise<string | undefined> {
    const segments = specifier.split("/");
    const nameLength = specifier.startsWith("@") ? 2 : 1;
    const member = this.byName.get(segments.slice(0, nameLength).join("/"));
    if (!member) return Promise.resolve(undefined);
    return member.resolve(segments.slice(nameLength).join("/"));
  }
}

function exportsMap(raw: unknown): Record<string, string> {
  if (typeof raw === "string") return { ".": raw };
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return {};
}
