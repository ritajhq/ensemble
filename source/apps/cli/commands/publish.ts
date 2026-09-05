import { Command } from "@cliffy/command";
import { runPublish } from "@ensemble/core";
import * as CliUtil from "./util.ts";

export const publishCommand = new Command()
  .name("publish")
  .description("Publish a previously packed ship using the given pack kit.")
  .arguments("<ship:string> <kit:string> <target:string>")
  .option(
    "-o, --output-name <name:string>",
    "Name of the local packed artifact to publish. Defaults to the ship name.",
  )
  .option(
    "--version <version:string>",
    "Version to publish this artifact under, alongside its :latest tag.",
    { default: "latest" },
  )
  .option("-v, --var <var:string>", "Override a publish var (KEY=VALUE). Repeatable.", {
    collect: true,
  })
  .action(async ({ outputName, version, var: vars }, ship, kit, target) => {
    const code = await runPublish(ship, kit, {
      target,
      outputName,
      version,
      varOverrides: CliUtil.parseVarOverrides(vars ?? []),
    });
    if (code !== 0) Deno.exit(code);
  });
