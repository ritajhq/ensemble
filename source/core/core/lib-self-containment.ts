import { basename, join, relative } from "@std/path";
import { exists } from "@std/fs";
import { EnsembleConfigStore } from "./config.ts";
import { DenoWorkspace, type Ecosystem } from "./ecosystem/index.ts";

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
  ecosystem: Ecosystem,
): Promise<WorkspaceMember[]> {
  const members: WorkspaceMember[] = [];
  const base = join(repoRoot, relativeSubdir);
  if (!await exists(base, { isDirectory: true })) return members;

  for await (const entry of Deno.readDir(base)) {
    if (!entry.isDirectory) continue;
    const found = await ecosystem.packageAt(join(base, entry.name));
    if (found?.name !== undefined) {
      members.push({
        name: found.name,
        relativePath: join(relativeSubdir, entry.name),
      });
    }
  }
  return members;
}

/**
 * Checks whether a libs library (`source/libs/<name>`) stays self-contained:
 * every link it declares in its own manifest must
 * resolve to something a real, external consumer could also resolve —
 * never into `source/core/**` (hard block, no exception, ever), and into a
 * sibling `source/libs/<other>` only when that sibling has made the same
 * portability commitment by being declared under `publish.libs:` in
 * `.ensemble/config.yaml`. Pure given the workspace's on-disk state: it
 * only reads package manifests and `.ensemble/config.yaml`, it never
 * mutates anything. Only ever invoked against `source/libs/*` paths — core
 * libraries are exempt by omission at the call site, not by a branch in
 * here.
 */
export class SelfContainmentChecker {
  constructor(
    private readonly repoRoot: string,
    private readonly ecosystem: Ecosystem = new DenoWorkspace(repoRoot),
  ) {}

  async check(libRoot: string): Promise<Violation[]> {
    const lib = await this.ecosystem.packageAt(libRoot);
    if (!lib) throw new Error(`No package found at ${libRoot}.`);

    const coreMembers = await findMembersUnder(
      this.repoRoot,
      join("source", "core"),
      this.ecosystem,
    );
    const libsMembers = await findMembersUnder(
      this.repoRoot,
      join("source", "libs"),
      this.ecosystem,
    );
    const config = await new EnsembleConfigStore(this.repoRoot).loadOrEmpty();
    const thisLibRelativePath = relative(this.repoRoot, libRoot);

    const violations: Violation[] = [];

    for (const { specifier, target: packageName } of lib.links) {
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
        const siblingName = basename(sibling.relativePath);
        const siblingDeclared = Boolean(
          config.publish?.libs?.some((lib) => lib.name === siblingName),
        );
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
