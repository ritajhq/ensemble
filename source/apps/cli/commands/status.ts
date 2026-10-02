import { Command } from "@cliffy/command";
import * as Core from "@ensemble/core";
import * as Host from "@ensemble/host";
import * as StatusFormats from "../status/index.ts";

export const statusCommand = new Command()
  .name("status")
  .description(
    "List every app, kit, publishable library, and workload this project knows about.",
  )
  .option("--json", "Print the status as one JSON document instead, for programs (e.g. the editor extension).")
  .action(async ({ json }) => {
    const repoRoot = await Host.createPorts().repo.findRepoRoot();
    const format = json ? new StatusFormats.Json() : new StatusFormats.Text();
    console.log(await new Core.Status.Survey(repoRoot).describeTo(format));
  });
