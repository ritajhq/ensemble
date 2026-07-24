import { Command } from "@cliffy/command";
import { buildCommand } from "./commands/build.ts";
import { configCommand } from "./commands/config.ts";
import { initCommand } from "./commands/init.ts";
import { packCommand } from "./commands/pack.ts";
import { workflowCommand } from "./commands/workflow.ts";

try {
  await new Command()
    .name("ens")
    .version("0.1.0")
    .description("Ensemble — from source code to deployment, in one CLI.")
    .command("init", initCommand)
    .command("build", buildCommand)
    .command("pack", packCommand)
    .command("workflow", workflowCommand)
    .command("config", configCommand)
    .parse(Deno.args);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  Deno.exit(1);
}
