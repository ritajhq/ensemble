import { Command, EnumType } from "@cliffy/command";
import * as Delivery from "@ensemble/delivery";
import * as Host from "@ensemble/host";
import { resolve } from "@std/path";

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
  .description("Print what a workload's delivery manifest declares.")
  .command("print", printCommand);
