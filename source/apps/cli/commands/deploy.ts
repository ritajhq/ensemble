import { Command, EnumType } from "@cliffy/command";
import { runDeploy, runExplain } from "@ensemble/core";

const explainCommand = new Command()
  .name("explain")
  .description(
    'Explain one resource\'s resolution: which provisioner matched (and why others didn\'t), each value\'s provenance, accepted capability gaps, and resolved outputs. <resource> is given as "category.name" (e.g. "databases.primary").',
  )
  .type("mode", new EnumType(["development", "production"]))
  .arguments("<name:string> <kit:string> <resource:string>")
  .option("-m, --mode <mode:mode>", "Deploy mode.", {
    default: "production" as const,
  })
  .option(
    "--version <version:string>",
    "Released version to resolve ${release.<name>.image} references to in production mode.",
    { default: "latest" },
  )
  .action(async ({ mode, version }, name, kit, resource) => {
    await runExplain(name, kit, resource, { mode, version });
  });

export const deployCommand = new Command()
  .name("deploy")
  .description(
    "Deploy a workload using the given deploy kit: render, then eject, plan, or apply (the default). " +
      "Tearing a workload down is out of scope for this rearchitecture's current phases.",
  )
  .type("mode", new EnumType(["development", "production"]))
  .arguments("<name:string> <kit:string>")
  .option("-m, --mode <mode:mode>", "Deploy mode.", {
    default: "production" as const,
  })
  .option(
    "--version <version:string>",
    "Released version to resolve ${release.<name>.image} references to in production mode.",
    { default: "latest" },
  )
  .option(
    "--eject",
    "Render and write the artifact to the outputs dir, then stop — no apply.",
  )
  .option(
    "--plan",
    "Render and show the intent-diff against the last apply/plan, then stop.",
  )
  .option(
    "--accept-capability-gaps",
    "Proceed even if the target kit can't satisfy a requested capability (otherwise this hard-fails).",
    { default: false },
  )
  .action(
    async ({ mode, version, eject, plan, acceptCapabilityGaps }, name, kit) => {
      if (eject && plan) {
        console.error("error: --eject and --plan can't be used together.");
        Deno.exit(1);
      }
      const termination = eject ? "eject" : plan ? "plan" : "apply";
      await runDeploy(name, kit, {
        mode,
        version,
        termination,
        acceptCapabilityGaps,
      });
    },
  )
  .command("explain", explainCommand);
