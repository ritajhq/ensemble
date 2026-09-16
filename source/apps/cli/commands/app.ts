import { Command } from "@cliffy/command";
import { runAppCreate } from "@ensemble/core";
import * as Host from "@ensemble/host";

export const appCommand = new Command()
  .name("app")
  .description("Manage apps under source/apps/.")
  .command(
    "create",
    new Command()
      .description("Scaffold a new app with a build kit's hello-world template.")
      .option("--target <target:string>", "Static build variant to scaffold for (e.g. the react kit's \"ssr\").")
      .arguments("<kit:string> <name:string>")
      .action(async ({ target }, kit, name) => {
        await runAppCreate({ kit, name, target }, Host.createPorts());
        console.log(`Scaffolded source/apps/${name} with kit "${kit}".`);
      }),
  );
