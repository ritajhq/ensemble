import { Command } from "@cliffy/command";
import { Input } from "@cliffy/prompt";
import { runInit } from "@ensemble/core";
import { SECRETS_PUBLIC_KEY_PATH } from "@ensemble/workflow";

export const initCommand = new Command()
  .name("init")
  .description("Scaffold a new Ensemble project.")
  .action(async () => {
    const name = await Input.prompt({
      message: "Project name:",
      validate: (value) =>
        value.trim().length > 0 || "Project name can't be empty.",
    });
    await runInit({ name });
    console.log(`\nGenerated a secrets keypair for this project.`);
    console.log(
      `Commit ${name}/${SECRETS_PUBLIC_KEY_PATH} — it lets encrypted context.secrets be added later.`,
    );
    console.log(
      `Never commit ${name}/.ensemble/secrets.key (already in .gitignore).`,
    );
  });
