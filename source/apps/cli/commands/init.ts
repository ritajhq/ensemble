import { Command } from "@cliffy/command";
import { Input } from "@cliffy/prompt";
import { runInit } from "@ensemble/core";

export const initCommand = new Command()
  .name("init")
  .description("Scaffold a new Ensemble project.")
  .action(async () => {
    const name = await Input.prompt({
      message: "Project name:",
      validate: (value) => value.trim().length > 0 || "Project name can't be empty.",
    });
    await runInit({ name });
  });
