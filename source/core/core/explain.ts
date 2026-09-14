import * as KitSdk from "@ensemble/kit-sdk";
import { loadDeployContext } from "./deploy-context.ts";
import { SubprocessPackKitGateway } from "./pack-kit-gateway.ts";

export interface RunExplainOptions {
  artifacts: KitSdk.Deploy.ArtifactsSource;
  /** Only meaningful if the explained resource's dependency chain reaches a `${release.<name>}` reference for published artifacts — same convention as `ens deploy --version`. */
  version: string;
}

/**
 * Runs `ens deploy explain <name> <kit> <resource>` (Phase 8): resolves and
 * renders the whole workload (same lookup as `ens deploy`, via
 * `loadDeployContext`) and prints everything `Explainer` reports about the
 * one resource named — which provisioner matched and why the others didn't,
 * each negotiated value's provenance (with kit-default values flagged),
 * accepted capability gaps, and the resource's real resolved outputs.
 */
export async function runExplain(
  name: string,
  kit: string,
  resource: string,
  options: RunExplainOptions,
): Promise<void> {
  const [category, resourceName] = resource.split(".");
  if (!category || !resourceName) {
    throw new Error(
      `Resource must be given as "category.name" (got "${resource}").`,
    );
  }

  const { workload, target, registry } = await loadDeployContext(name, kit);

  const locatorResolver = new KitSdk.Deploy.ReleaseLocatorResolver(
    new SubprocessPackKitGateway(),
  );
  const releaseLocator = new KitSdk.Deploy.PreresolvedReleaseLocator(
    await locatorResolver.resolveAll(
      workload,
      options.artifacts,
      options.version,
    ),
  );
  const renderer = new KitSdk.Deploy.Render.Renderer(
    new KitSdk.Deploy.Render.ReferenceResolver(target.kit.realization()),
    releaseLocator,
    registry,
  );

  const explainer = new KitSdk.Deploy.Explain.Explainer(registry, renderer);
  const explanation = explainer.explain(
    workload,
    target,
    options.artifacts,
    category as KitSdk.Deploy.Category,
    resourceName,
  );

  present(explanation);
}

function present(explanation: KitSdk.Deploy.Explain.ResourceExplanation): void {
  console.log(
    `Resource: ${explanation.category}.${explanation.name} (${explanation.contractId})\n`,
  );

  console.log("Provisioner matching:");
  for (const match of explanation.provisionerMatches) {
    console.log(`  ${match.matched ? "✓" : "✗"} ${match.description}`);
  }

  console.log("\nResolved values:");
  const concerns = Object.keys(explanation.values);
  if (concerns.length === 0) console.log("  (none)");
  for (const concern of concerns) {
    const { value, provenance } = explanation.values[concern];
    const flag = explanation.flaggedDefaults.includes(concern)
      ? "  ⚠ unreviewed kit default, no platform override"
      : "";
    console.log(`  ${concern}: ${value} (${provenance})${flag}`);
  }

  console.log("\nCapability gaps:");
  if (explanation.capabilityGaps.length === 0) console.log("  (none)");
  for (const gap of explanation.capabilityGaps) {
    console.log(
      `  "${gap.capability}" requested ${gap.requested}, not satisfied by this kit`,
    );
  }

  console.log("\nResolved outputs:");
  for (
    const [output, { knowability, value }] of Object.entries(
      explanation.outputs,
    )
  ) {
    const shown = knowability === "static"
      ? JSON.stringify(value)
      : "bound at deploy";
    console.log(`  ${output}: ${shown}`);
  }
}
