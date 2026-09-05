import { Command } from "@cliffy/command";
import { runDeploy } from "@ensemble/core";

export const developCommand = new Command()
  .name("develop")
  .description(
    "Deploy a workload locally for development: always watches for source changes, and treats external resources as auto-creatable local conveniences instead of requiring them to already exist.",
  )
  .arguments("<name:string>")
  .option("-k, --kit <kit:string>", "Deploy kit to use.", { default: "compose" })
  .action(async ({ kit }, name) => {
    await runDeploy(name, kit, { action: "up", mode: "development" });
  });
