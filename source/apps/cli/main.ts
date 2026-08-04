import { Command } from "@cliffy/command";
import { getInstalledVersion } from "@ensemble/core";
import { buildCommand } from "./commands/build.ts";
import { configCommand } from "./commands/config.ts";
import { initCommand } from "./commands/init.ts";
import { packCommand } from "./commands/pack.ts";
import { releaseCommand } from "./commands/release.ts";
import { formatVersion, versionCommand } from "./commands/version.ts";
import { workflowCommand } from "./commands/workflow.ts";

try {
  const installed = await getInstalledVersion();
  const version = installed ? formatVersion(installed) : "unknown (no install marker found)";

  await new Command()
    .name("ens")
    .version(version)
    .description("Ensemble — from source code to deployment, in one CLI.")
    .command("init", initCommand)
    .command("build", buildCommand)
    .command("pack", packCommand)
    .command("workflow", workflowCommand)
    .command("config", configCommand)
    .command("release", releaseCommand)
    .command("version", versionCommand)
    .parse(Deno.args);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  Deno.exit(1);
}
