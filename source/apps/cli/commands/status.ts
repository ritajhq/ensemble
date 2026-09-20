import { Command } from "@cliffy/command";
import { runStatus } from "@ensemble/core";
import * as Host from "@ensemble/host";

export const statusCommand = new Command()
  .name("status")
  .description(
    "List every app, kit, publishable library, and workload this project knows about.",
  )
  .action(async () => {
    await runStatus(Host.createPorts());
  });
