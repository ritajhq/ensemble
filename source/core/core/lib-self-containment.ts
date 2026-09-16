import { basename, join, relative } from "@std/path";
import { exists } from "@std/fs";
import { EnsembleConfigStore } from "./config.ts";

/** One import a libs library takes that its self-containment check rejects. */
export interface Violation {
  readonly importSpecifier: string;
  readonly reason: string;
}

interface WorkspaceMember {
  name: string;
  /** Path relative to the repo root, e.g. "source/core/kit-sdk" or "source/libs/widgets". */
  relativePath: string;
}

async function findMembersUnder(
  repoRoot: string,
  relativeSubdir: string,
): Promise<WorkspaceMember[]> {
  const members: WorkspaceMember[] = [];
  const base = join(repoRoot, relativeSubdir);
  if (!await exists(base, { isDirectory: true })) return members;

  for await (const entry of Deno.readDir(base)) {
    if (!entry.isDirectory) continue;
    const denoJsonPath = join(base, entry.name, "deno.json");
    if (!await exists(denoJsonPath, { isFile: true })) continue;

    const parsed = JSON.parse(await Deno.readTextFile(denoJsonPath)) as {
      name?: string;
    };
    if (typeof parsed.name === "string") {
      members.push({
        name: parsed.name,
        relativePath: join(relativeSubdir, entry.name),
      });
    }
  }
  return members;
}

/**
 * A workspace member is linked (as opposed to an ordinary versioned external
 * dependency) via a bare, version-less `jsr:@scope/name` specifier — e.g.
 * `"@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk"` vs. an external dependency's
 * `"@std/path": "jsr:@std/path@1.1.6"`. The scope's own "@" is always the
 * first one, so a specifier with no version has exactly one "@" total.
 */
function workspaceLinkPackageName(target: string): string | undefined {
  if (!target.startsWith("jsr:")) return undefined;
  const rest = target.slice("jsr:".length);
  const atCount = (rest.match(/@/g) ?? []).length;
  return atCount === 1 ? rest : undefined;
}

/**
 * Checks whether a libs library (`source/libs/<name>`) stays self-contained:
 * every workspace-linked import it declares in its own `deno.json` must
 * resolve to something a real, external consumer could also resolve —
 * never into `source/core/**` (hard block, no exception, ever), and into a
 * sibling `source/libs/<other>` only when that sibling has made the same
 * portability commitment by being declared under `libs:` in
 * `.ensemble/config.yaml`. Pure given the workspace's on-disk state: it
 * only reads `deno.json` files and `.ensemble/config.yaml`, it never
 * mutates anything. Only ever invoked against `source/libs/*` paths — core
 * libraries are exempt by omission at the call site, not by a branch in
 * here.
 */
export class SelfContainmentChecker {
  constructor(private readonly repoRoot: string) {}

  async check(libRoot: string): Promise<Violation[]> {
    const denoJson = JSON.parse(
      await Deno.readTextFile(join(libRoot, "deno.json")),
    ) as {
      imports?: Record<string, string>;
    };
    const imports = denoJson.imports ?? {};

    const coreMembers = await findMembersUnder(
      this.repoRoot,
      join("source", "core"),
    );
    const libsMembers = await findMembersUnder(
      this.repoRoot,
      join("source", "libs"),
    );
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    const thisLibRelativePath = relative(this.repoRoot, libRoot);

    const violations: Violation[] = [];

    for (const [specifier, target] of Object.entries(imports)) {
      const packageName = workspaceLinkPackageName(target);
      if (packageName === undefined) continue;

      const core = coreMembers.find((member) => member.name === packageName);
      if (core) {
        violations.push({
          importSpecifier: specifier,
          reason:
            `"${specifier}" resolves into ${core.relativePath} (source/core/**) — a libs library can never depend on core.`,
        });
        continue;
      }

      const sibling = libsMembers.find((member) => member.name === packageName);
      if (sibling) {
        if (sibling.relativePath === thisLibRelativePath) continue;
        const siblingDeclared = Boolean(config.libs?.[basename(sibling.relativePath)]);
        if (!siblingDeclared) {
          violations.push({
            importSpecifier: specifier,
            reason:
              `"${packageName}" isn't published anywhere consumers could resolve it from.`,
          });
        }
        continue;
      }

      violations.push({
        importSpecifier: specifier,
        reason:
          `"${specifier}" resolves to "${packageName}", which isn't a recognized workspace member.`,
      });
    }

    return violations;
  }
}
