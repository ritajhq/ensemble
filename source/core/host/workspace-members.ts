import { dirname, join } from "@std/path";
import { exists, expandGlob } from "@std/fs";

/** Where the workspace's root `deno.json` lives: `source/` in a new project, the repository's root in an older one. */
export async function findWorkspaceRoot(repoRoot: string): Promise<string> {
  const legacy = await exists(join(repoRoot, "deno.json"), { isFile: true });
  return legacy ? repoRoot : join(repoRoot, "source");
}

/** The `workspace` globs from the workspace's root `deno.json` — either form Deno accepts (a list, or `{ members: [...] }`). */
export async function readMemberPatterns(root: string): Promise<string[]> {
  const rootConfig = join(root, "deno.json");
  if (!await exists(rootConfig, { isFile: true })) return [];
  const parsed = JSON.parse(await Deno.readTextFile(rootConfig));
  const workspace = parsed?.workspace;
  const patterns = Array.isArray(workspace) ? workspace : workspace?.members;
  if (!Array.isArray(patterns)) return [];
  return patterns.filter((pattern: unknown) => typeof pattern === "string");
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
    const root = await findWorkspaceRoot(repoRoot);
    for (const pattern of await readMemberPatterns(root)) {
      const configs = expandGlob(join(pattern, "deno.json"), {
        root,
        exclude: ["**/node_modules/**"],
      });
      for await (const config of configs) {
        const parsed = JSON.parse(await Deno.readTextFile(config.path));
        if (typeof parsed?.name !== "string") continue;
        byName.set(
          parsed.name,
          new Member(dirname(config.path), exportsMap(parsed.exports)),
        );
      }
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
