import { Command } from "@cliffy/command";
import { runPack } from "@ensemble/core";

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
  .action(async ({ mode, outputName }, ship, kit) => {
    const code = await runPack(ship, kit, { mode, outputName });
    if (code !== 0) Deno.exit(code);
  });
