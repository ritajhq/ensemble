import { Command, EnumType } from "@cliffy/command";
import { runDeploy, runExplain } from "@ensemble/core";
import * as Host from "@ensemble/host";

const explainCommand = new Command()
  .name("explain")
  .description(
    'Explain one resource\'s resolution: which provisioner matched (and why others didn\'t), each value\'s provenance, accepted capability gaps, and resolved outputs. <resource> is given as "category.name" (e.g. "databases.primary").',
  )
  .type("artifacts", new EnumType(["local", "published"]))
  .arguments("<name:string> <kit:string> <resource:string>")
  .option(
    "--artifacts <artifacts:artifacts>",
    "Which release locator to resolve.",
    {
      default: "published" as const,
    },
  )
  .option(
    "--version <version:string>",
    "Released version to resolve ${release.<name>} references to for published artifacts.",
    { default: "latest" },
  )
  .action(async ({ artifacts, version }, name, kit, resource) => {
    await runExplain(
      name,
      kit,
      resource,
      { artifacts, version },
      Host.createPorts().repo,
      new Host.SubprocessPackKitGateway(),
      new Host.SubprocessKitLoader(),
    );
  });

export const deployCommand = new Command()
  .name("deploy")
  .description(
    "Deploy a workload using the given deploy kit: render, then eject, plan, or apply (the default). " +
      "Tearing a workload down is out of scope for this rearchitecture's current phases.",
  )
  .type("artifacts", new EnumType(["local", "published"]))
  .arguments("<name:string> <kit:string>")
  .option(
    "--artifacts <artifacts:artifacts>",
    "Which release locator to resolve.",
    {
      default: "published" as const,
    },
  )
  .option(
    "--version <version:string>",
    "Released version to resolve ${release.<name>} references to for published artifacts.",
    { default: "latest" },
  )
  .option(
    "--eject",
    "Render and write the artifact to the outputs dir, then stop — no apply.",
  )
  .option(
    "--plan",
    "Render and show the intent-diff against the last apply/plan, then stop.",
  )
  .option(
    "--watch",
    "Run the kit's long-lived watch command instead of a one-shot apply, torn down on Ctrl+C.",
    { default: false },
  )
  .option(
    "--no-pack",
    "Skip packing referenced releases before a local apply (default: pack). Ignored for published artifacts.",
  )
  .option(
    "--accept-capability-gaps",
    "Proceed even if the target kit can't satisfy a requested capability (otherwise this hard-fails).",
    { default: false },
  )
  .option(
    "--emulate-externals",
    "Before applying, stand up a local substitute for each declared external resource the kit knows how to emulate (e.g. `docker network create` for an external network) instead of assuming it already exists elsewhere.",
    { default: false },
  )
  .option(
    "--verbose",
    "Let a local apply's pack step show the kit's own build-tool output (e.g. docker buildx build's progress log) instead of hiding it behind the pack spinner.",
    { default: false },
  )
  .action(
    async (
      {
        artifacts,
        version,
        eject,
        plan,
        watch,
        pack,
        acceptCapabilityGaps,
        emulateExternals,
        verbose,
      },
      name,
      kit,
    ) => {
      if (eject && plan) {
        console.error("error: --eject and --plan can't be used together.");
        Deno.exit(1);
      }
      if (watch && (eject || plan)) {
        console.error("error: --watch can't be used with --eject or --plan.");
        Deno.exit(1);
      }
      if (emulateExternals && (eject || plan)) {
        console.error(
          "error: --emulate-externals can't be used with --eject or --plan.",
        );
        Deno.exit(1);
      }
      const termination = eject ? "eject" : plan ? "plan" : "apply";
      await runDeploy(
        name,
        kit,
        {
          artifacts,
          version,
          termination,
          acceptCapabilityGaps,
          watch,
          pack,
          emulateExternals,
          verbose,
          reporter: new Host.AnimatedPackReporter(),
          buildReporter: new Host.AnimatedBuildReporter(),
        },
        Host.createPorts(),
        new Host.SubprocessPackKitGateway(),
        new Host.SubprocessKitLoader(),
      );
    },
  )
  .command("explain", explainCommand);
