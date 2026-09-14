import { Command } from "@cliffy/command";
import { runDeploy } from "@ensemble/core";

/**
 * A one-shot `apply` in development mode — no watch loop yet. Watch (Section
 * 12, a reserved seam: syncing local build output into a running container)
 * is not built as part of this rearchitecture's current phases; this command
 * is otherwise the same `DeploymentCoordinator` path `ens deploy` uses.
 */
export const developCommand = new Command()
  .name("develop")
  .description(
    "Deploy a workload locally for development (one-shot — no watch loop yet).",
  )
  .arguments("<name:string>")
  .option("-k, --kit <kit:string>", "Deploy kit to use.", {
    default: "compose",
  })
  .action(async ({ kit }, name) => {
    await runDeploy(name, kit, {
      mode: "development",
      version: "latest",
      termination: "apply",
      acceptCapabilityGaps: false,
    });
  });
