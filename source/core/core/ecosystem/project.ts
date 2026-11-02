import { join } from "@std/path";
import { exists } from "@std/fs";
import { EnsembleConfigStore } from "../config.ts";
import type { Ports } from "../ports.ts";
import { DenoWorkspace } from "./deno-workspace.ts";
import type {
  Ecosystem,
  Invocation,
  Package,
  StampTarget,
  Toolchain,
} from "./ecosystem.ts";
import { Kit } from "./kit.ts";

const BUILT_IN = "deno";

/** Where a pinned tool's settings land: every process `ens` starts from here on inherits them, kits and what they run included. */
export type ToolEnvironment = Pick<typeof Deno.env, "set">;

/**
 * The ecosystems a project declares under `ecosystems:` in
 * `.ensemble/config.yaml`, told everything together. A project that declares
 * none is a Deno project: Deno needs no kit, since `ens` and its kits run on
 * it regardless.
 */
export class Project implements Ecosystem {
  private constructor(
    private readonly ecosystems: ReadonlyMap<string, Ecosystem & Toolchain>,
  ) {}

  /** Puts the project's pinned tool versions in effect too, so anything acting on the project runs them. */
  static async load(
    repoRoot: string,
    ports: Pick<Ports, "denoExe" | "process">,
    environment: ToolEnvironment = Deno.env,
  ): Promise<Project> {
    const config = await new EnsembleConfigStore(repoRoot).loadOrEmpty();
    const ecosystems = new Map<string, Ecosystem & Toolchain>();
    for (const name of config.ecosystems ?? [BUILT_IN]) {
      ecosystems.set(name, await Project.resolve(name, repoRoot, ports));
    }
    const project = new Project(ecosystems);
    await project.pinTools(config.tools ?? {}, environment);
    return project;
  }

  private static async resolve(
    name: string,
    repoRoot: string,
    ports: Pick<Ports, "denoExe" | "process">,
  ): Promise<Ecosystem & Toolchain> {
    const directory = join(repoRoot, ".ensemble", "kits", "ecosystem", name);
    if (await exists(join(directory, "main.ts"), { isFile: true })) {
      return new Kit(repoRoot, directory, ports);
    }
    if (name === BUILT_IN) {
      return new DenoWorkspace(
        repoRoot,
        async () =>
          await ports.process.capture(
            await ports.denoExe.resolveDenoExecutable(),
            ["--version"],
          ),
      );
    }
    throw new Error(
      `Ecosystem "${name}" not found (expected a kit at ${directory}).`,
    );
  }

  private async pinTools(
    tools: Readonly<Record<string, Record<string, string>>>,
    environment: ToolEnvironment,
  ): Promise<void> {
    for (const [name, versions] of Object.entries(tools)) {
      const ecosystem = this.ecosystems.get(name);
      if (!ecosystem) {
        throw new Error(
          `tools.${name} in .ensemble/config.yaml pins tools for an ecosystem this project doesn't declare. It declares: ${
            [...this.ecosystems.keys()].join(", ")
          }.`,
        );
      }
      for (const [tool, version] of Object.entries(versions)) {
        if (typeof version === "string") continue;
        throw new Error(
          `tools.${name}.${tool} in .ensemble/config.yaml must be a string: YAML reads 1.90 as the number 1.9, so quote it.`,
        );
      }
      const settings = await ecosystem.environmentFor(versions);
      for (const [variable, value] of Object.entries(settings)) {
        environment.set(variable, value);
      }
    }
  }

  /** One declared ecosystem, for an action that has to choose. The first declared is the project's default. */
  named(name?: string): Ecosystem {
    const chosen = name ?? [...this.ecosystems.keys()][0];
    const ecosystem = this.ecosystems.get(chosen);
    if (ecosystem) return ecosystem;
    throw new Error(
      `This project doesn't declare ecosystem "${chosen}". It declares: ${
        [...this.ecosystems.keys()].join(", ")
      }.`,
    );
  }

  async initialize(): Promise<void> {
    for (const ecosystem of this.ecosystems.values()) {
      await ecosystem.initialize();
    }
  }

  /** The built-in ecosystem first: its generated config is what an ecosystem kit is about to be launched through. */
  async sync(): Promise<void> {
    await this.ecosystems.get(BUILT_IN)?.sync();
    for (const [name, ecosystem] of this.ecosystems) {
      if (name !== BUILT_IN) await ecosystem.sync();
    }
  }

  /** A tool no ecosystem claims runs as it was asked to. */
  async invocation(
    tool: string,
    args: readonly string[],
  ): Promise<Invocation> {
    for (const ecosystem of this.ecosystems.values()) {
      const invocation = await ecosystem.invocation(tool, args);
      if (invocation) return invocation;
    }
    return { args };
  }

  /** A directory belongs to at most one ecosystem: two manifests claiming it would leave its version and links ambiguous. Nesting is fine. */
  async packageAt(directory: string): Promise<Package | undefined> {
    const claims = new Map<string, Package>();
    for (const [name, ecosystem] of this.ecosystems) {
      const found = await ecosystem.packageAt(directory);
      if (found) claims.set(name, found);
    }
    if (claims.size > 1) {
      throw new Error(
        `${directory} is claimed by more than one ecosystem: ${
          [...claims.keys()].join(", ")
        }.`,
      );
    }
    return [...claims.values()][0];
  }

  async stamp(
    version: string,
    targets: readonly StampTarget[],
  ): Promise<string[]> {
    const changed = [];
    for (const ecosystem of this.ecosystems.values()) {
      changed.push(...await ecosystem.stamp(version, targets));
    }
    return changed;
  }

  scaffoldLibrary(directory: string, name: string): Promise<void> {
    return this.named().scaffoldLibrary(directory, name);
  }

  async lockfiles(): Promise<string[]> {
    const lockfiles = [];
    for (const ecosystem of this.ecosystems.values()) {
      lockfiles.push(...await ecosystem.lockfiles());
    }
    return lockfiles;
  }
}
