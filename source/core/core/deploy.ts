import { join } from "@std/path";
import * as KitSdk from "@ensemble/kit-sdk";
import { loadDeployContext } from "./deploy-context.ts";

export type DeployTermination = "eject" | "plan" | "apply";

export interface RunDeployOptions {
  mode: KitSdk.Deploy.Mode;
  /** Which released version `${release.<name>.image}` resolves to in production mode — meaningless in development mode, where the local tag is always used regardless. */
  version: string;
  termination: DeployTermination;
  acceptCapabilityGaps: boolean;
}

/**
 * Resolves a deployment's workload manifest and deploy kit by name, and runs
 * the requested termination (eject/plan/apply) via the new
 * `DeploymentCoordinator` (Phase 6). A from-scratch rebuild of the old
 * `runDeploy` (removed per the rearchitecture's G1) — same manifest/kit
 * resolution conventions (`ci/<name>/delivery.yml`,
 * `.ensemble/kits/deploy/<kit>/`), but a fundamentally different pipeline
 * underneath (contracts, negotiated values, dependency-ordered render,
 * three terminations instead of one up/down action).
 */
export async function runDeploy(
  name: string,
  kit: string,
  options: RunDeployOptions,
): Promise<void> {
  const { repoRoot, workload, target, registry } = await loadDeployContext(
    name,
    kit,
  );

  const releaseLocator = new KitSdk.Deploy.WorkloadReleaseLocator(
    workload,
    options.version,
  );
  const renderer = new KitSdk.Deploy.Render.Renderer(
    new KitSdk.Deploy.Render.ReferenceResolver(target.kit.realization()),
    releaseLocator,
    registry,
  );

  const outputsDir = join(repoRoot, "source", "artifacts", "deploy", name);
  const sink = new KitSdk.Deploy.Terminations.FileArtifactSink(outputsDir);
  const cache = new KitSdk.Deploy.Terminations.FileRenderCache(
    join(repoRoot, ".ensemble", "deploy", name, "last-rendered.txt"),
  );

  const coordinator = new KitSdk.Deploy.Terminations.DeploymentCoordinator(
    registry,
    renderer,
    new KitSdk.Deploy.Terminations.Ejector(sink),
    new KitSdk.Deploy.Terminations.Planner(cache),
    new KitSdk.Deploy.Terminations.Applier(sink, cache),
  );

  const result = await coordinator.deploy(name, workload, target, {
    mode: options.mode,
    termination: options.termination,
    acceptCapabilityGaps: options.acceptCapabilityGaps,
  });

  for (const report of result.gaps) {
    console.warn(
      `warning: capability "${report.gap.capability}" unmet by kit "${kit}" on ${report.resource} (requested ${report.gap.requested}) — accepted.`,
    );
  }

  presentResult(result, name);
}

function presentResult(
  result: KitSdk.Deploy.Terminations.DeployResult,
  name: string,
): void {
  switch (result.termination) {
    case "eject":
      console.log(`Ejected ${result.artifact.filename} for "${name}":\n`);
      console.log(result.artifact.content);
      break;
    case "plan":
      if (!result.diff.changed) {
        console.log("No changes.");
        break;
      }
      for (const line of result.diff.lines) {
        const prefix = line.kind === "added"
          ? "+"
          : line.kind === "removed"
          ? "-"
          : " ";
        console.log(`${prefix} ${line.text}`);
      }
      break;
    case "apply":
      console.log(`Applied "${name}".`);
      break;
  }
}
