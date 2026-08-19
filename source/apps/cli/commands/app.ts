import { Command } from "@cliffy/command";
import { runAppCreate } from "@ensemble/core";

export const appCommand = new Command()
  .name("app")
  .description("Manage apps under source/apps/.")
  .command(
    "create",
    new Command()
      .description("Scaffold a new app with a build kit's hello-world template.")
      .arguments("<kit:string> <name:string>")
      .action(async (_options, kit, name) => {
        await runAppCreate({ kit, name });
        console.log(`Scaffolded source/apps/${name} with kit "${kit}".`);
      }),
  );
