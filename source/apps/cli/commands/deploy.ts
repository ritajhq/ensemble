import { Command, EnumType } from "@cliffy/command";
import { runDeploy } from "@ensemble/core";

export const deployCommand = new Command()
  .name("deploy")
  .description(
    "Deploy a workload using the given deploy kit (bring it up, or reconcile it to its declared state). Tearing a workload down lives behind `ens destroy`.",
  )
  .type("mode", new EnumType(["development", "production"]))
  .arguments("<name:string> <kit:string>")
  .option("-m, --mode <mode:mode>", "Deploy mode.", { default: "production" as const })
  .option(
    "--version <version:string>",
    'Released version to resolve ${release.<name>.image} references to.',
    { default: "latest" },
  )
  .action(async ({ mode, version }, name, kit) => {
    await runDeploy(name, kit, { action: "up", mode, version });
  });
