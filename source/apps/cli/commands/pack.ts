import { Command } from "@cliffy/command";
import { runPack } from "@ensemble/core";
import * as Host from "@ensemble/host";
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
  .option("-w, --watch", "Repack on source changes. Only supported by kits that declare watch support (e.g. deno.compile).")
  .option(
    "--verbose",
    "Show the kit's own build-tool output (e.g. docker buildx build's progress log) instead of hiding it behind the pack spinner.",
  )
  .option("-v, --var <var:string>", "Override a pack var (KEY=VALUE). Repeatable.", {
    collect: true,
  })
  .action(async ({ mode, outputName, watch, verbose, var: vars }, ship, kit) => {
    const code = await runPack(ship, kit, {
      mode,
      outputName,
      watch: Boolean(watch),
      verbose: Boolean(verbose),
      varOverrides: CliUtil.parseVarOverrides(vars ?? []),
      reporter: new Host.AnimatedPackReporter(),
    }, Host.createPorts());
    if (code !== 0) Deno.exit(code);
  });
