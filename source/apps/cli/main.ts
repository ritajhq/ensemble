import { Command } from "@cliffy/command";
import * as Core from "@ensemble/core";
import { appCommand } from "./commands/app.ts";
import { buildCommand } from "./commands/build.ts";
import { configCommand } from "./commands/config.ts";
import { deployCommand } from "./commands/deploy.ts";
import { developCommand } from "./commands/develop.ts";
import { initCommand } from "./commands/init.ts";
import { packCommand } from "./commands/pack.ts";
import { publishCommand } from "./commands/publish.ts";
import { releaseCommand } from "./commands/release.ts";
import { formatVersion, versionCommand } from "./commands/version.ts";
import { workflowCommand } from "./commands/workflow.ts";

try {
  const installed = await new Core.Version.SelfUpdateService().getInstalledVersion();
  const version = installed ? formatVersion(installed) : "unknown (no install marker found)";

  await new Command()
    .name("ens")
    .version(version)
    .description("Ensemble — from source code to deployment, in one CLI.")
    .command("init", initCommand)
    .command("app", appCommand)
    .command("build", buildCommand)
    .command("pack", packCommand)
    .command("publish", publishCommand)
    .command("deploy", deployCommand)
    .command("develop", developCommand)
    .command("workflow", workflowCommand)
    .command("config", configCommand)
    .command("release", releaseCommand)
    .command("version", versionCommand)
    .parse(Deno.args);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  Deno.exit(1);
}
