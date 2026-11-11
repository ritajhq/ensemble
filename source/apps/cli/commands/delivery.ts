import { Command, EnumType } from "@cliffy/command";
import {
  DeploymentEnvironment,
  Instance,
  listDeliveryTasks,
  runDeliveryTask,
} from "@ensemble/core";
import * as Delivery from "@ensemble/delivery";
import * as Host from "@ensemble/host";
import { resolve } from "@std/path";

/**
 * `ens delivery <name> <kit> tasks` lists a workload's declared tasks, name and
 * description; `ens delivery <name> <kit> task <task> [args...]` runs one
 * of them (see `@ensemble/core`'s `deploy/task.ts` for what a task is
 * and why it's invoked rather than fired by a deploy). The kit is named, not configured, because
 * a task's script lives in the kit's own folder (`ci/<name>/<kit>/`) — the
 * same task can do its operator step differently on each platform — and
 * because resolving a task's arguments means rendering the workload, which
 * only that kit can do.
 *
 * A task acts on a deployment you brought up locally, so without `--env-file`
 * it loads the same files `ens develop` does.
 *
 * Nested under `delivery` rather than a bare `ens task`, because what makes a
 * task meaningful is *which* delivery it belongs to: the manifest declaring
 * it, the workload whose values its arguments resolve against, and the stack
 * that workload's deploy brought up. `tasks` and `task` are verbs after the delivery;
 * `print` stays a subcommand since it needs no kit.
 */
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

const DELIVERY_DESCRIPTION =
  "Workload delivery: the non-provisioning operator steps a manifest declares (`ens delivery <name> <kit> tasks|task`), and `print`.";

export const deliveryCommand = new Command()
  .name("delivery")
  .description(DELIVERY_DESCRIPTION)
  .type("artifacts", new EnumType(["local", "published"]))
  .arguments(
    "<name:string> <kit:string> <verb:string> [task:string] [args...:string]",
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
      { artifacts, version, envFile, instance },
      name: string,
      kit: string,
      verb: string,
      task: string | undefined,
      ...args: string[]
    ) => {
      const envFiles = envFile
        ? DeploymentEnvironment.required(envFile)
        : (resolvedKit: string) =>
          DeploymentEnvironment.developConvention(name, resolvedKit);
      const repo = Host.createPorts().repo;

      const verbs: Record<string, () => Promise<void>> = {
        tasks: () => listDeliveryTasks(name, kit, { envFiles }, repo),
        task: () => {
          if (!task) {
            throw new Error(
              `Name a task: ens delivery ${name} ${kit} task <task> [args...]. List them with: ens delivery ${name} ${kit} tasks.`,
            );
          }
          return runDeliveryTask(
            name,
            kit,
            task,
            args,
            {
              artifacts,
              version,
              envFiles,
              instance: instance ? Instance.parse(instance) : undefined,
            },
            repo,
            new Host.SubprocessPackKitGateway(),
            new Host.SubprocessKitLoader(),
          );
        },
      };
      const verbAction = verbs[verb];
      if (!verbAction) {
        throw new Error(
          `Unknown delivery verb "${verb}". Expected one of: ${
            Object.keys(verbs).join(", ")
          }.`,
        );
      }
      await verbAction();
    },
  )
  .command("print", printCommand);
