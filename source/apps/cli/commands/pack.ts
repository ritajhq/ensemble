import { Command } from "@cliffy/command";
import { runPack } from "@ensemble/core";
import * as CliUtil from "./util.ts";

export const packCommand = new Command()
  .name("pack")
  .description("Pack a ship using the given pack kit.")
  .arguments("<ship:string> <kit:string>")
  .option(
    "-m, --mode <mode:string>",
    "Pack mode, declared by the kit's kit.yml. Defaults to its first declared mode.",
  )
  .option(
    "-o, --output-name <name:string>",
    "Name to give the packed output (e.g. an image tag or archive name). Defaults to the ship name.",
  )
  .option("-v, --var <var:string>", "Override a pack var (KEY=VALUE). Repeatable.", {
    collect: true,
  })
  .action(async ({ mode, outputName, var: vars }, ship, kit) => {
    const code = await runPack(ship, kit, {
      mode,
      outputName,
      varOverrides: CliUtil.parseVarOverrides(vars ?? []),
    });
    if (code !== 0) Deno.exit(code);
  });
