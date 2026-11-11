import { buildApp, type RunBuildOptions } from "./build.ts";
import { type EnsembleConfig, EnsembleConfigStore } from "./config.ts";
import { Project } from "./ecosystem/index.ts";
import { packShip, type RunPackOptions } from "./pack.ts";
import type { Ports } from "./ports.ts";

function keyOf(kind: "build" | "pack", name: string, mode: string): string {
  return `${kind}:${name}:${mode}`;
}

/**
 * Runs builds and packs, each once per run: a pack asks its kit which apps it depends on and builds those first, and
 * several packs may depend on the same app. Only the step asked for watches, since what it depends on has to be there
 * before it starts.
 */
class Pipeline {
  private readonly running = new Set<string>();

  private constructor(
    private readonly config: EnsembleConfig,
    private readonly ports: Ports,
    private readonly done: Set<string>,
  ) {}

  static async open(ports: Ports, done: Set<string>): Promise<Pipeline> {
    const repoRoot = await ports.repo.findRepoRoot();
    await (await Project.load(repoRoot, ports)).sync();
    const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();
    return new Pipeline(config, ports, done);
  }

  async build(name: string, options: RunBuildOptions): Promise<number> {
    return await this.once(
      "build",
      name,
      options.mode,
      async () => await buildApp(name, options, this.ports),
    );
  }

  async pack(
    ship: string,
    givenKit: string | undefined,
    options: RunPackOptions,
  ): Promise<number> {
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
    return await this.once(
      "pack",
      ship,
      "production",
      async () =>
        await packShip(
          ship,
          kit,
          resolved,
          (app) =>
            this.build(app, {
              mode: "production",
              watch: false,
              reporter: options.buildReporter,
            }),
          this.ports,
        ),
    );
  }

  private async once(
    kind: "build" | "pack",
    name: string,
    mode: string,
    run: () => Promise<number>,
  ): Promise<number> {
    const key = keyOf(kind, name, mode);
    if (this.done.has(key)) return 0;
    if (this.running.has(key)) {
      throw new Error(
        `${kind} ${name} depends on itself, by way of what its pack kit depends on.`,
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
}

/**
 * Builds what `name` names, (see
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
 * after whatever apps the kit itself
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
    done.add(keyOf("build", app, "production"));
  }
  const pipeline = await Pipeline.open(ports, done);
  return await pipeline.pack(ship, kit, options);
}
