import { Command } from "@cliffy/command";
import { DeploymentEnvironment, runDeploy } from "@ensemble/core";
import * as Host from "@ensemble/host";

/**
 * Pure sugar for `ens deploy <name> <kit> --mode development --artifacts
 * local --emulate-externals --watch` — no semantics of its own, beyond
 * defaulting the kit to compose when neither `-k` nor `deploy.<name>.kit` in
 * .ensemble/config.yaml names one. Packs the referenced releases, then runs
 * the kit's long-lived watch command until Ctrl+C. A kit/target with no
 * watch command surfaces `WatchNotSupportedError`.
 */
export const developCommand = new Command()
  .name("develop")
  .description(
    "Deploy a workload locally for development (sugar for `deploy --mode development --emulate-externals --artifacts local --watch`).",
  )
  .arguments("<name:string>")
  .option(
    "-k, --kit <kit:string>",
    "Deploy kit to use (default: the one `deploy.<name>.kit` in .ensemble/config.yaml names, else compose).",
  )
  .option(
    "--verbose",
    "Let the initial pack step show the kit's own build-tool output (e.g. docker buildx build's progress log) instead of hiding it behind the pack spinner, and the watch session show the kit's own stdout instead of only its warnings and errors.",
    { default: false },
  )
  .option(
    "--env-file <path:string>",
    "Load an env file (repo-root relative or absolute, repeatable) instead of the default ci/<name>/dev.env and .ensemble/deploy/<name>/secrets.env.",
    { collect: true },
  )
  .action(async ({ kit, verbose, envFile }, name) => {
    await runDeploy(
      name,
      kit,
      {
        artifacts: "local",
        fallbackKit: "compose",
        version: "latest",
        termination: "apply",
        mode: "development",
        acceptCapabilityGaps: false,
        watch: true,
        pack: true,
        emulateExternals: true,
        verbose,
        envFiles: envFile
          ? DeploymentEnvironment.required(envFile)
          : DeploymentEnvironment.developConvention(name),
        reporter: new Host.AnimatedPackReporter(),
        buildReporter: new Host.AnimatedBuildReporter(),
      },
      Host.createPorts(),
      new Host.SubprocessPackKitGateway(),
      new Host.SubprocessKitLoader(),
    );
  });
