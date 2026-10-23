import { Command, EnumType } from "@cliffy/command";
import {
  DeploymentEnvironment,
  Instance,
  runDeliveryTask,
} from "@ensemble/core";
import * as Delivery from "@ensemble/delivery";
import * as Host from "@ensemble/host";
import { resolve } from "@std/path";

/**
 * `ens delivery task <name> [task] [args...]` — runs one of a workload's
 * declared tasks (see `@ensemble/core`'s `deploy/task.ts` for what a task is
 * and why it's invoked rather than fired by a deploy); with no task named, it
 * lists what the workload declares. The kit (`-k`, else the one
 * `deploy.<name>.kit` in .ensemble/config.yaml names, as for `ens deploy`) is
 * needed because resolving a task's arguments means rendering the workload,
 * and only a kit can render it.
 *
 * A task acts on a deployment you brought up locally, so without `--env-file`
 * it loads the same files `ens develop` does.
 *
 * Nested under `delivery` rather than a bare `ens task`, because what makes a
 * task meaningful is *which* delivery it belongs to: the manifest declaring
 * it, the workload whose values its arguments resolve against, and the stack
 * that workload's deploy brought up.
 */
const taskCommand = new Command()
  .name("task")
  .description(
    "Run one of a workload's tasks declared in ci/<name>/delivery.yml, or list them when no task is named.",
  )
  .type("artifacts", new EnumType(["local", "published"]))
  .arguments("<name:string> [task:string] [args...:string]")
  .option(
    "-k, --kit <kit:string>",
    "Deploy kit to use (default: the one `deploy.<name>.kit` in .ensemble/config.yaml names).",
  )
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
    "--instance <slug:string>",
    "Act on this named instance of the workload (see `ens deploy --instance`) rather than its plain deployment.",
  )
  .option(
    "--env-file <path:string>",
    "Load an env file (repo-root relative or absolute, repeatable) instead of the default ci/<name>/dev.env, ci/<name>/<kit>.env and .ensemble/deploy/<name>/secrets.env.",
    { collect: true },
  )
  .action(
    async (
      { artifacts, version, envFile, instance, kit },
      name: string,
      task: string | undefined,
      ...args: string[]
    ) => {
      await runDeliveryTask(
        name,
        kit,
        task,
        args,
        {
          artifacts,
          version,
          envFiles: envFile
            ? DeploymentEnvironment.required(envFile)
            : (resolvedKit) =>
              DeploymentEnvironment.developConvention(name, resolvedKit),
          instance: instance ? Instance.parse(instance) : undefined,
        },
        Host.createPorts().repo,
        new Host.SubprocessPackKitGateway(),
        new Host.SubprocessKitLoader(),
      );
    },
  );

/**
 * `ens delivery print <name>` — prints what `ci/<name>/delivery.yml`
 * declares: for now the architecture of its `deploy` block, every piece (with
 * the icon, details, description and layer a renderer draws it by) and every
 * use one makes of another. The manifest is read as written, so no deploy
 * kit or env file is needed.
 *
 * `json`, the default, prints the architecture itself. `markdown` writes it to
 * `docs/<name>/architecture.md`, drawn with reladraw, the drawing and its
 * source beside it.
 */
const printCommand = new Command()
  .name("print")
  .description(
    "Print the architecture a delivery manifest's deploy block declares, with every reference resolved.",
  )
  .type("render", new EnumType(["json", "markdown"]))
  .arguments("<name:string>")
  .option(
    "-r, --render <render:render>",
    "json prints the architecture; markdown writes a page with a drawing of it.",
    { default: "json" as const },
  )
  .option(
    "-o, --output <path:string>",
    "Where --render markdown writes its page (default: docs/<name>/architecture.md). The drawing and its source are written beside it.",
  )
  .action(async ({ render, output }, name: string) => {
    if (output && render !== "markdown") {
      throw new Error("--output only applies to --render markdown.");
    }
    const repo = Host.createPorts().repo;
    const architecture = new Delivery.Print.Deploy.Mapper().map(
      await new Delivery.Print.Deploy.ManifestSource(repo).read(name),
    );

    const renderers: Record<
      typeof render,
      () => Promise<Delivery.Print.Deploy.Renderer>
    > = {
      json: () => Promise.resolve(new Delivery.Print.Deploy.Json.Renderer()),
      markdown: async () =>
        new Delivery.Print.Deploy.Markdown.Renderer(
          output ? resolve(output) : Delivery.Print.Deploy.Markdown.Renderer
            .pageIn(await repo.findRepoRoot(), name),
        ),
    };
    const rendering = await (await renderers[render]())
      .render(name, architecture);

    if (rendering.stdout) console.log(rendering.stdout);
    if (rendering.written.length > 0) console.log(rendering.written.join("\n"));
    rendering.warnings.forEach((warning) => console.error(warning));
  });

export const deliveryCommand = new Command()
  .name("delivery")
  .description(
    "Workload delivery: the non-provisioning operator steps a manifest declares.",
  )
  .command("task", taskCommand)
  .command("print", printCommand);
