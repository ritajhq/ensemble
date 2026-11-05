import type { LaunchEntry } from "./launch.ts";

/** What the manifest may name that exists outside it: the builds and packs the project's config declares. */
export interface KnownOutputs {
  readonly builds: ReadonlySet<string>;
  readonly packs: ReadonlySet<string>;
}

/** What one launch entry uses, by name. */
export interface Used {
  readonly builds: readonly string[];
  readonly packs: readonly string[];
  readonly launches: readonly string[];
}

/** Raised when a launch entry names something that doesn't exist, or the entries wait on each other. */
export class LaunchPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchPlanError";
  }
}

const BUILD_OR_PACK = /\$\{(build|pack)\.([^.{}]+)\}/g;
const LAUNCH_PORT = /\$\{launch\.([^.{}]+)\.([^.{}]+)\}/g;

/**
 * The checked shape of a manifest's `launch:` section: which builds, packs and other entries each entry uses, and the
 * order to start them in. The order comes only from references — an entry that mentions `${launch.kernel.http}` starts
 * after `kernel` — so there is no ordering key to keep in step with them. References to deploy resources are not this
 * class's business: they are values for the deploy renderer.
 */
export class LaunchPlan {
  private readonly used = new Map<string, Used>();
  private readonly startOrder: readonly string[];

  constructor(
    private readonly entries: Readonly<Record<string, LaunchEntry>>,
    private readonly known: KnownOutputs,
  ) {
    for (const [name, entry] of Object.entries(entries)) {
      this.used.set(name, this.read(name, entry));
    }
    this.startOrder = this.sort();
  }

  /** Entry names, each after the entries it refers to; entries that don't refer to each other keep manifest order. */
  order(): readonly string[] {
    return this.startOrder;
  }

  usedBy(name: string): Used {
    return this.used.get(name)!;
  }

  private read(name: string, entry: LaunchEntry): Used {
    const text = this.valuesOf(entry);
    const builds = new Set<string>();
    const packs = new Set<string>();
    const launches = new Set<string>();

    for (const [, kind, target] of text.flatMap((value) => [...value.matchAll(BUILD_OR_PACK)])) {
      this.checkOutput(name, kind as "build" | "pack", target);
      (kind === "build" ? builds : packs).add(target);
    }
    for (const [, target, port] of text.flatMap((value) => [...value.matchAll(LAUNCH_PORT)])) {
      this.checkPort(name, target, port);
      launches.add(target);
    }
    for (const watch of entry.development?.restart ?? []) {
      this.checkRestart(name, watch);
    }
    return { builds: [...builds], packs: [...packs], launches: [...launches] };
  }

  private valuesOf(entry: LaunchEntry): string[] {
    return [
      ...(entry.command ?? []),
      ...(entry.package === undefined ? [] : [entry.package]),
      ...Object.values(entry.env).map(String),
    ];
  }

  private checkOutput(name: string, kind: "build" | "pack", target: string): void {
    const known = kind === "build" ? this.known.builds : this.known.packs;
    if (known.has(target)) return;
    throw new LaunchPlanError(`launch.${name} refers to ${kind} ${target}, which the project does not declare.`);
  }

  private checkRestart(name: string, watch: { build: string } | { pack: string }): void {
    const [kind, target] = "build" in watch ? ["build", watch.build] as const : ["pack", watch.pack] as const;
    const known = kind === "build" ? this.known.builds : this.known.packs;
    if (known.has(target)) return;
    throw new LaunchPlanError(
      `launch.${name} asks for a restart on ${kind} ${target}, which the project does not declare.`,
    );
  }

  private checkPort(name: string, target: string, port: string): void {
    const other = this.entries[target];
    if (other === undefined) {
      throw new LaunchPlanError(`launch.${name} refers to launch.${target}, which the manifest does not declare.`);
    }
    if (port in other.ports) return;
    throw new LaunchPlanError(`launch.${name} refers to launch.${target}.${port}, but launch.${target} has no port named ${port}.`);
  }

  private sort(): string[] {
    const placed: string[] = [];
    const state = new Map<string, "visiting" | "done">();

    const visit = (name: string, path: readonly string[]): void => {
      if (state.get(name) === "done") return;
      if (state.get(name) === "visiting") {
        const loop = [...path.slice(path.indexOf(name)), name];
        throw new LaunchPlanError(`launch entries wait on each other in a cycle: ${loop.join(" -> ")}.`);
      }
      state.set(name, "visiting");
      for (const dependency of this.used.get(name)!.launches) {
        // An entry may mention its own port (to be told which one to listen on); that is not waiting on itself.
        if (dependency !== name) visit(dependency, [...path, name]);
      }
      state.set(name, "done");
      placed.push(name);
    };

    for (const name of Object.keys(this.entries)) visit(name, []);
    return placed;
  }
}
