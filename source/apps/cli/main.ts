import { Command } from "@cliffy/command";
import { buildCommand } from "./commands/build.ts";
import { packCommand } from "./commands/pack.ts";

try {
  await new Command()
    .name("ens")
    .version("0.1.0")
    .description("Ensemble — from source code to deployment, in one CLI.")
    .command("build", buildCommand)
    .command("pack", packCommand)
    .parse(Deno.args);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  Deno.exit(1);
}
