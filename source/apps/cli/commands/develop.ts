import { Command } from "@cliffy/command";
import { runDeploy } from "@ensemble/core";
import * as Host from "@ensemble/host";

/**
 * Pure sugar for `ens deploy <name> <kit> --artifacts local --watch` — no
 * semantics of its own; nothing in the code branches on "am I develop."
 * Packs the referenced releases, then runs the kit's long-lived watch
 * command until Ctrl+C. A kit/target with no watch command (aws today)
 * surfaces `WatchNotSupportedError`.
 */
export const developCommand = new Command()
  .name("develop")
  .description(
    "Deploy a workload locally for development (sugar for `deploy --emulate-externals --artifacts local --watch`).",
  )
  .arguments("<name:string>")
  .option("-k, --kit <kit:string>", "Deploy kit to use.", {
    default: "compose",
  })
  .option(
    "--verbose",
    "Let the initial pack step show the kit's own build-tool output (e.g. docker buildx build's progress log) instead of hiding it behind the pack spinner.",
    { default: false },
  )
  .action(async ({ kit, verbose }, name) => {
    await runDeploy(
      name,
      kit,
      {
        artifacts: "local",
        version: "latest",
        termination: "apply",
        acceptCapabilityGaps: false,
        watch: true,
        pack: true,
        emulateExternals: true,
        verbose,
        reporter: new Host.AnimatedPackReporter(),
        buildReporter: new Host.AnimatedBuildReporter(),
      },
      Host.createPorts(),
      new Host.SubprocessPackKitGateway(),
      new Host.SubprocessKitLoader(),
    );
  });
