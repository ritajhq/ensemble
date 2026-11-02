import { Command } from "@cliffy/command";
import { runExec, runSync } from "@ensemble/core";
import * as Host from "@ensemble/host";

export const syncCommand = new Command()
  .name("sync")
  .description(
    "Bring every ecosystem's generated files in line with the packages on disk.",
  )
  .action(async () => {
    await runSync(Host.createPorts());
  });

export const execCommand = new Command()
  .name("exec")
  .description(
    "Run a language's own tool against this project, e.g. ens exec deno test source/core.",
  )
  .arguments("<tool:string> [args...:string]")
  // Everything after the tool is the tool's, its flags included.
  .useRawArgs()
  .action(async (_, ...[tool, ...args]: string[]) => {
    const code = await runExec(tool, args, Host.createPorts());
    if (code !== 0) Deno.exit(code);
  });
