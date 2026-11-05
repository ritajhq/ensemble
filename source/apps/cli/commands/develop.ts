import { Command } from "@cliffy/command";
import { DeploymentEnvironment, Launching, runDeploy } from "@ensemble/core";
import * as Host from "@ensemble/host";

/**
 * Pure sugar for `ens deploy <name> <kit> --artifacts
 * local --emulate-externals --watch` — no semantics of its own, beyond
 * defaulting the kit to compose when neither `-k` nor `deploy.<name>.kit` in
 * .ensemble/config.yaml names one. Packs the referenced releases, then runs
 * the kit's long-lived watch command until Ctrl+C. A kit/target with no
 * watch command surfaces `WatchNotSupportedError`.
 */
export const developCommand = new Command()
  .name("develop")
  .description(
    "Deploy a workload locally for development (sugar for `deploy --emulate-externals --artifacts local --watch`).",
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
    "--no-runtime",
    "Leave the local runtime the kit deploys to alone (the proxy in front of a compose stack's gateways, the local AWS): bring up nothing, attach to what is running. Default: `deploy.<name>.development.runtime` in .ensemble/config.yaml, else bring it up.",
  )
  .option(
    "--env-file <path:string>",
    "Load an env file (repo-root relative or absolute, repeatable) instead of the default ci/<name>/dev.env, ci/<name>/<kit>.env and .ensemble/deploy/<name>/secrets.env.",
    { collect: true },
  )
  .action(async ({ kit, verbose, envFile, runtime }, name) => {
    if (verbose) Deno.env.set("ENS_DEBUG", "1");
    const ports = Host.createPorts();
    const envFiles = envFile
      ? DeploymentEnvironment.required(envFile)
      : (kit: string) => DeploymentEnvironment.developConvention(name, kit);

    // A manifest's `launch:` section is started once what it deploys is up, or at once when it deploys nothing.
    const launch = await Launching.Launch.open(
      name,
      typeof envFiles === "function" ? envFiles("launch") : envFiles,
      ports,
    );
    if (launch && !launch.alsoDeploys) return await launch.run();

    await runDeploy(
      name,
      kit,
      {
        artifacts: "local",
        fallbackKit: "compose",
        version: "latest",
        termination: "apply",
        acceptCapabilityGaps: false,
        watch: true,
        runtime: runtime === false ? false : undefined,
        pack: true,
        emulateExternals: true,
        verbose,
        envFiles,
        onUp: launch ? () => launch.begin() : undefined,
        reporter: new Host.AnimatedPackReporter(),
        buildReporter: new Host.AnimatedBuildReporter(),
      },
      ports,
      new Host.SubprocessPackKitGateway(),
      new Host.SubprocessKitLoader(),
    );
    await launch?.end();
  });
