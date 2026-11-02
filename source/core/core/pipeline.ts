import { join } from "@std/path";
import { exists } from "@std/fs";
import { buildApp, type RunBuildOptions } from "./build.ts";
import { type EnsembleConfig, EnsembleConfigStore } from "./config.ts";
import { Project } from "./ecosystem/index.ts";
import { KitProcess } from "./kit-process.ts";
import type { Need } from "./need-context.ts";
import { Needs, type Step } from "./needs.ts";
import { packShip, type RunPackOptions } from "./pack.ts";
import type { Ports } from "./ports.ts";

function keyOf(step: Step, mode: string): string {
  return `${step.kind}:${step.name}:${mode}`;
}

/**
 * Runs a build or a pack after whatever it `needs:`, and each of those once:
 * either kind of step can need either kind, which is why neither `build.ts` nor
 * `pack.ts` drives the other. Only the step asked for watches, since what it
 * needs has to be there before it starts.
 */
class Pipeline {
  private readonly running = new Set<string>();

  private constructor(
    private readonly repoRoot: string,
    private readonly config: EnsembleConfig,
    private readonly needs: Needs,
    private readonly ports: Ports,
    private readonly done: Set<string>,
  ) {}

  static async open(ports: Ports, done: Set<string>): Promise<Pipeline> {
    const repoRoot = await ports.repo.findRepoRoot();
    await (await Project.load(repoRoot, ports)).sync();
    const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();
    return new Pipeline(repoRoot, config, new Needs(config), ports, done);
  }

  async build(name: string, options: RunBuildOptions): Promise<number> {
    const step: Step = { kind: "build", name };
    const code = await this.prerequisites(step, options.mode, {
      version: undefined,
      reporter: options.reporter,
    });
    if (code !== 0) return code;
    return await this.buildOnce(name, options);
  }

  async pack(
    ship: string,
    kit: string | undefined,
    options: RunPackOptions,
  ): Promise<number> {
    const step: Step = { kind: "pack", name: ship };
    const code = await this.prerequisites(step, "production", {
      version: options.version,
      deployKit: options.deployKit,
      verbose: options.verbose,
      reporter: options.buildReporter,
      packReporter: options.reporter,
    });
    if (code !== 0) return code;
    return await this.packOnce(ship, kit, options);
  }

  private async prerequisites(
    step: Step,
    mode: RunBuildOptions["mode"],
    inherited: Inherited,
  ): Promise<number> {
    for (const prerequisite of this.needs.prerequisitesOf(step)) {
      const code = prerequisite.kind === "build"
        ? await this.buildOnce(prerequisite.name, {
          mode,
          watch: false,
          reporter: inherited.reporter,
        })
        : await this.packOnce(prerequisite.name, undefined, {
          version: inherited.version,
          deployKit: inherited.deployKit,
          verbose: inherited.verbose,
          reporter: inherited.packReporter,
          buildReporter: inherited.reporter,
        });
      if (code !== 0) return code;
    }
    return 0;
  }

  private async buildOnce(
    name: string,
    options: RunBuildOptions,
  ): Promise<number> {
    const step: Step = { kind: "build", name };
    return await this.once(step, options.mode, async () =>
      await buildApp(
        name,
        options,
        await this.outputsOf(step),
        this.ports,
      ));
  }

  private async packOnce(
    ship: string,
    givenKit: string | undefined,
    options: RunPackOptions,
  ): Promise<number> {
    const step: Step = { kind: "pack", name: ship };
    const declared = this.config.pack?.[ship];
    const kit = givenKit ?? declared?.kit;
    if (!kit) {
      throw new Error(
        `No pack kit for "${ship}": name one, or set pack.${ship}.kit in .ensemble/config.yaml.`,
      );
    }
    const fromConfig = declared?.kit === kit ? declared : undefined;
    const resolved: RunPackOptions = {
      ...options,
      mode: options.mode ?? fromConfig?.mode,
      outputName: options.outputName ?? fromConfig?.outputName,
    };
    return await this.once(step, "production", async () =>
      await packShip(
        ship,
        kit,
        resolved,
        await this.outputsOf(step, options.deployKit, options.version),
        (app) =>
          this.build(app, {
            mode: "production",
            watch: false,
            reporter: options.buildReporter,
          }),
        this.ports,
      ));
  }

  private async once(
    step: Step,
    mode: string,
    run: () => Promise<number>,
  ): Promise<number> {
    const key = keyOf(step, mode);
    if (this.done.has(key)) return 0;
    if (this.running.has(key)) {
      throw new Error(
        `Needs form a cycle through ${step.kind} ${step.name}, by way of what its pack kit depends on.`,
      );
    }
    this.running.add(key);
    try {
      const code = await run();
      if (code === 0) this.done.add(key);
      return code;
    } finally {
      this.running.delete(key);
    }
  }

  private async outputsOf(
    step: Step,
    deployKit?: string,
    version?: string,
  ): Promise<Need[]> {
    const outputs: Need[] = [];
    for (const need of this.needs.of(step)) {
      outputs.push({
        ...need,
        output: need.kind === "build"
          ? join(this.repoRoot, "source", "artifacts", need.name)
          : await this.packOutput(need.name, deployKit, version),
      });
    }
    return outputs;
  }

  /** Asks the pack kit where its output is, since only it knows: a file, a folder, a Docker image's reference. */
  private async packOutput(
    ship: string,
    deployKit?: string,
    version?: string,
  ): Promise<string> {
    const artifacts = join(this.repoRoot, "source", "artifacts");
    const declared = this.config.pack?.[ship];
    const kitDir = join(
      this.repoRoot,
      ".ensemble",
      "kits",
      "pack",
      declared?.kit ?? "",
    );
    if (!declared?.kit) return join(artifacts, "packages");
    if (!await exists(join(kitDir, "describe.ts"), { isFile: true })) {
      return join(artifacts, "packages");
    }
    const outputName = declared.outputName ?? ship;
    return await new KitProcess(kitDir, this.ports).capture("describe.ts", [
      "--name",
      ship,
      "--output-name",
      outputName,
      "--package-name",
      outputName,
      "--version",
      version ?? "latest",
      "--artifacts",
      "local",
      ...(deployKit ? ["--deploy-kit", deployKit] : []),
    ]);
  }
}

/** What a needed step takes from the one needing it. */
interface Inherited {
  readonly version?: string;
  readonly deployKit?: string;
  readonly verbose?: boolean;
  readonly reporter?: RunBuildOptions["reporter"];
  readonly packReporter?: RunPackOptions["reporter"];
}

/**
 * Builds what `name` names, after whatever it declares it `needs:` (see
 * `Pipeline`). The code is the first failure's, or 0.
 */
export async function runBuild(
  name: string,
  options: RunBuildOptions,
  ports: Ports,
): Promise<number> {
  const pipeline = await Pipeline.open(ports, options.done ?? new Set());
  return await pipeline.build(name, options);
}

/**
 * Packs a ship through the kit given, or else the one `pack.<ship>.kit` names,
 * after whatever it declares it `needs:` and whatever apps the kit itself
 * reports depending on (see `packShip`).
 */
export async function runPack(
  ship: string,
  kit: string | undefined,
  options: RunPackOptions,
  ports: Ports,
): Promise<number> {
  const done = options.done ?? new Set<string>();
  for (const app of options.skipBuildingApps ?? []) {
    done.add(keyOf({ kind: "build", name: app }, "production"));
  }
  const pipeline = await Pipeline.open(ports, done);
  return await pipeline.pack(ship, kit, options);
}
