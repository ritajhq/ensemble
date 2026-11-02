import { Command } from "@cliffy/command";
import { Input } from "@cliffy/prompt";
import { runInit } from "@ensemble/core";
import * as Host from "@ensemble/host";

export const initCommand = new Command()
  .name("init")
  .description("Scaffold a new Ensemble project.")
  .arguments("[name:string]")
  .option(
    "--ecosystem <ecosystem:string>",
    "A language the project uses, as an ecosystem kit's name or the built-in deno. Repeat for several; the first is the default for new libraries (default: deno).",
    { collect: true },
  )
  .option(
    "--kits-from <url:string>",
    'Fetch kits from this git repository (optionally "<url>@<ref>") instead of ensemble\'s own.',
  )
  .action(async ({ ecosystem, kitsFrom }, givenName) => {
    const name = givenName ?? await Input.prompt({
      message: "Project name:",
      validate: (value) =>
        value.trim().length > 0 || "Project name can't be empty.",
    });
    await runInit(
      { name, ecosystems: ecosystem, kitsFrom },
      Host.createPorts(),
    );
    console.log(`\nScaffolded a new Ensemble project at ${name}/.`);
  });
