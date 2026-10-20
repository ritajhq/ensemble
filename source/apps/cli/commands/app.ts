import { Command } from "@cliffy/command";
import { runAppCreate } from "@ensemble/core";
import * as Host from "@ensemble/host";

export const appCommand = new Command()
  .name("app")
  .description(
    "Manage apps under source/apps/, and their integrations under source/integrations/.",
  )
  .command(
    "create",
    new Command()
      .description(
        "Scaffold a new app — or an existing app's integration for a deploy kit — with a build kit's hello-world template.",
      )
      .option(
        "--target <target:string>",
        'Static build variant to scaffold for (e.g. the react kit\'s "ssr").',
      )
      .option(
        "--integration <deployKit:string>",
        "Scaffold the app's integration for this deploy kit, at source/integrations/<deployKit>/<name>, instead of the app.",
      )
      .arguments("<kit:string> <name:string>")
      .action(async ({ target, integration }, kit, name) => {
        await runAppCreate(
          { kit, name, target, integration },
          Host.createPorts(),
        );
        const where = integration
          ? `source/integrations/${integration}/${name}`
          : `source/apps/${name}`;
        console.log(`Scaffolded ${where} with kit "${kit}".`);
      }),
  );
