import type { LaunchEntry, LaunchType } from "../deploy/launch.ts";
import { DeploymentEnvironment } from "../env-files.ts";
import type { AssignedPorts } from "./ports.ts";

/** Where a build's or a pack's output is on disk. */
export interface Locations {
  build(app: string): string;
  pack(ship: string): string;
}

/** Raised when a launch value can't be filled in. */
export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

/** A launch entry with every value filled in: ready to start. */
export interface Runnable {
  readonly name: string;
  readonly type: LaunchType;
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** Port name → number, for the ones it listens on. */
  readonly ports: Readonly<Record<string, number>>;
}

const REFERENCE = /\$\{([a-z]+)\.([^.{}]+)(?:\.([^.{}]+))?\}/g;

/**
 * Fills in a launch entry's `${...}` references: a build or pack becomes where its output is, another entry's port
 * becomes its number, and a secret named by `envSecrets` becomes the value the environment holds for it. What a
 * `desktop` entry runs is its package; what a `process` entry runs is its command.
 */
export class Values {
  constructor(
    private readonly locations: Locations,
    private readonly ports: AssignedPorts,
    private readonly environment: (name: string) => string | undefined = (
      name,
    ) => Deno.env.get(name),
  ) {}

  runnable(name: string, entry: LaunchEntry): Runnable {
    return {
      name,
      type: entry.type,
      argv: (entry.type === "desktop" ? [entry.package!] : entry.command!).map((
        value,
      ) => this.text(name, value)),
      env: { ...this.plainEnv(name, entry), ...this.secretEnv(name, entry) },
      ports: this.portsOf(name, entry),
    };
  }

  private plainEnv(name: string, entry: LaunchEntry): Record<string, string> {
    return Object.fromEntries(
      Object.entries(entry.env).map((
        [key, value],
      ) => [key, this.text(name, String(value))]),
    );
  }

  private secretEnv(name: string, entry: LaunchEntry): Record<string, string> {
    return Object.fromEntries(
      Object.entries(entry.envSecrets).map((
        [key, secret],
      ) => [key, this.secret(name, secret)]),
    );
  }

  private secret(name: string, secret: string): string {
    const variable = DeploymentEnvironment.variableOf(secret);
    const value = this.environment(variable);
    if (value !== undefined) return value;
    throw new ValueError(
      `launch.${name} needs secret ${secret}: set ${variable} or put it in the deployment's secrets.env.`,
    );
  }

  private portsOf(name: string, entry: LaunchEntry): Record<string, number> {
    return Object.fromEntries(
      Object.keys(entry.ports).map((
        port,
      ) => [port, this.ports.get(`${name}.${port}`)!]),
    );
  }

  private text(name: string, raw: string): string {
    return raw.replace(
      REFERENCE,
      (whole, category: string, target: string, output?: string) => {
        if (category === "build") return this.locations.build(target);
        if (category === "pack") return this.locations.pack(target);
        if (category === "launch") {
          return String(
            this.ports.get(`${target}.${output}`),
          );
        }
        throw new ValueError(
          `launch.${name} uses ${whole}: only builds, packs and launch ports can be used in a launch entry so far.`,
        );
      },
    );
  }
}
