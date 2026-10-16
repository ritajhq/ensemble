import { Command } from "@cliffy/command";
import { Instance, runDestroy } from "@ensemble/core";
import * as Host from "@ensemble/host";

export const destroyCommand = new Command()
  .name("destroy")
  .description(
    "Take a deployed workload down using the given deploy kit (or the one `deploy.<name>.kit` in .ensemble/config.yaml names), and drop the state `ens deploy` kept for it.",
  )
  .arguments("<name:string> [kit:string]")
  .option(
    "--instance <slug:string>",
    "Destroy this named instance (see `ens deploy --instance`) rather than the manifest's plain deployment.",
  )
  .action(async ({ instance }, name, kit) => {
    await runDestroy(
      name,
      kit,
      { instance: instance ? Instance.parse(instance) : undefined },
      Host.createPorts(),
      new Host.SubprocessKitLoader(),
    );
  });
