import { Command } from "@cliffy/command";
import { findRepoRoot, setAppBuildKit } from "@ensemble/core";

export const configCommand = new Command()
  .name("config")
  .description("Manage .ensemble/config.yaml.")
  .command(
    "set-build-kit",
    new Command()
      .description("Associate an app with a build kit.")
      .arguments("<app:string> <kit:string>")
      .action(async (_options, app, kit) => {
        const repoRoot = await findRepoRoot();
        await setAppBuildKit(repoRoot, app, kit);
        console.log(`Set build.${app}.kit = ${kit}`);
      }),
  );
