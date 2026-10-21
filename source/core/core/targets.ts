import { join } from "@std/path";
import { exists } from "@std/fs";
import * as Deploy from "./deploy/index.ts";
import { loadDeployContext } from "./deploy-context.ts";
import type { RepoLocator } from "./ports.ts";

/** One resource as a kit would hold it. */
export interface PlacedResource {
  readonly resource: string;
  readonly type: string;
  /** The technology holding it, for a type that has engines. */
  readonly engine?: string;
  /** Whether the manifest chose that engine (`engine:` on the resource) rather than taking the kit's default. */
  readonly pinned: boolean;
}

/** What one installed deploy kit says about a workload. */
export interface TargetReport {
  readonly kit: string;
  /** Present when the kit can deploy it: every resource, as it would hold it. */
  readonly resources?: readonly PlacedResource[];
  /** Present when it can't: why. */
  readonly reason?: string;
}

/**
 * For every installed deploy kit, whether it can deploy `name`'s manifest and
 * how it would hold each resource — resolution only, nothing rendered or
 * applied, and no secret needed. A kit that can't is not an error here but an
 * answer: its reason is the explicit price of the manifest as written, most
 * often a type it has no provisioner for or an engine the manifest pins that
 * it doesn't provide.
 */
export async function reportTargets(
  name: string,
  repo: RepoLocator,
  kitLoader: Deploy.KitLoader,
): Promise<TargetReport[]> {
  const repoRoot = await repo.findRepoRoot();
  const kitsDir = join(repoRoot, ".ensemble", "kits", "deploy");
  const kits: string[] = [];
  if (await exists(kitsDir, { isDirectory: true })) {
    for await (const entry of Deno.readDir(kitsDir)) {
      if (entry.isDirectory) kits.push(entry.name);
    }
  }
  kits.sort();
  const reports: TargetReport[] = [];
  for (const kit of kits) {
    if (!await exists(join(kitsDir, kit, "main.ts"), { isFile: true })) {
      continue;
    }
    reports.push(await reportTarget(name, kit, repo, kitLoader));
  }
  return reports;
}

async function reportTarget(
  name: string,
  kit: string,
  repo: RepoLocator,
  kitLoader: Deploy.KitLoader,
): Promise<TargetReport> {
  try {
    const context = await loadDeployContext(name, kit, repo, kitLoader, {
      envFiles: [],
      requireEnvironment: false,
    });
    const resolution = await new Deploy.Resolve.WorkloadResolver(
      context.registry,
    ).resolve(context.workload, context.target);
    const resources = [...resolution.matches].map(
      ([key, matched]): PlacedResource => {
        const engine = resolution.values.get(key)?.values.engine;
        return {
          resource: key,
          type: matched.declaration.type,
          ...(engine ? { engine: String(engine.value) } : {}),
          pinned: engine?.provenance === "pin",
        };
      },
    );
    return { kit, resources };
  } catch (error) {
    return {
      kit,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** `ens deploy targets <name>`: where the manifest can run, and what it costs where it can't. */
export function presentTargets(
  name: string,
  reports: readonly TargetReport[],
): string {
  const lines = [`${name}:`];
  for (const report of reports) {
    if (report.reason !== undefined) {
      lines.push(`  ✗ ${report.kit} — ${report.reason}`);
      continue;
    }
    const held = report.resources!.filter((placed) => placed.engine).map((
      placed,
    ) =>
      `${placed.resource} on ${placed.engine}${
        placed.pinned ? " (pinned)" : ""
      }`
    );
    lines.push(
      `  ✓ ${report.kit}${held.length > 0 ? ` — ${held.join(", ")}` : ""}`,
    );
  }
  const pinned = reports.flatMap((report) => report.resources ?? []).filter((
    placed,
  ) => placed.pinned);
  const runsOn = reports.filter((report) => report.reason === undefined).map((
    report,
  ) => report.kit);
  if (pinned.length > 0) {
    const names = [
      ...new Set(
        pinned.map((placed) => `${placed.resource} → ${placed.engine}`),
      ),
    ];
    lines.push(
      `Runs on: ${runsOn.join(", ") || "no installed kit"}. Pinned: ${
        names.join(", ")
      }.`,
    );
  } else {
    lines.push(
      `Runs on: ${runsOn.join(", ") || "no installed kit"}. Nothing is pinned.`,
    );
  }
  return lines.join("\n");
}
