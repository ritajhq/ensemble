import { join } from "@std/path";
import { exists } from "@std/fs";
import type { Deploy } from "@ensemble/core";
import { Deploy as CoreDeploy } from "@ensemble/core";
import { resolveDenoExecutable } from "./deno-exe.ts";
import { KitHost } from "./kit-host.ts";

/** Plain-data shape of `deploy-kit-rpc-wrapper.ts`'s reconstructed `graph` argument for `present`. */
interface SerializedDependencyGraph {
  batches: readonly Deploy.Resolve.ResourceId[][];
  dependencies: Record<string, readonly Deploy.Resolve.ResourceId[]>;
}

/** `DependencyGraph` is a class instance with real methods (`dependenciesOf`), which JSON can't carry across the subprocess boundary — snapshot it into plain data here, where the real graph is still available to query, and have the wrapper reconstruct an equivalent duck-typed object on the other side. */
function serializeDependencyGraph(
  graph: Deploy.Resolve.DependencyGraph,
): SerializedDependencyGraph {
  const batches = graph.batches();
  const dependencies: Record<string, readonly Deploy.Resolve.ResourceId[]> = {};
  for (const batch of batches) {
    for (const id of batch) {
      dependencies[`${id.category}.${id.name}`] = graph.dependenciesOf(id);
    }
  }
  return { batches, dependencies };
}

class SubprocessProvisioner implements Deploy.Provisioner {
  constructor(
    private readonly host: KitHost,
    private readonly index: number,
    capabilities: { describe: boolean; provision: boolean },
  ) {
    if (capabilities.describe) {
      this.describe = () =>
        this.host.call(`provisioner:${this.index}`, "describe", []) as Promise<
          string
        >;
    }
    if (capabilities.provision) {
      this.provision = (request: Deploy.ResolvedRequest) =>
        this.host.call(`provisioner:${this.index}`, "provision", [
          request,
        ]) as Promise<Deploy.ProvisionOutcome>;
    }
  }

  describe?: Deploy.Provisioner["describe"];
  provision?: Deploy.Provisioner["provision"];

  matches(resource: unknown, runtime?: string): Promise<boolean> {
    return this.host.call(`provisioner:${this.index}`, "matches", [
      resource,
      runtime,
    ]) as Promise<boolean>;
  }
}

class SubprocessRealization implements Deploy.Realization {
  constructor(private readonly host: KitHost) {}

  private call(method: string, args: unknown[]): Promise<unknown> {
    return this.host.call("realization", method, args);
  }

  classPreset(
    category: Deploy.Category,
    type: string,
    className: string,
  ): Promise<Deploy.ClassPreset | undefined> {
    return this.call("classPreset", [category, type, className]) as Promise<
      Deploy.ClassPreset | undefined
    >;
  }
  defaultFor(
    category: Deploy.Category,
    type: string,
    concern: string,
  ): Promise<number | boolean | string | undefined> {
    return this.call("defaultFor", [category, type, concern]) as Promise<
      number | boolean | string | undefined
    >;
  }
  boundFor(
    category: Deploy.Category,
    type: string,
    concern: string,
  ): Promise<Deploy.Bound | undefined> {
    return this.call("boundFor", [category, type, concern]) as Promise<
      Deploy.Bound | undefined
    >;
  }
  supportsCapability(
    category: Deploy.Category,
    type: string,
    capability: string,
  ): Promise<boolean> {
    return this.call("supportsCapability", [
      category,
      type,
      capability,
    ]) as Promise<
      boolean
    >;
  }
  knowabilityOf(
    category: Deploy.Category,
    type: string,
    output: string,
  ): Promise<Deploy.Knowability> {
    return this.call("knowabilityOf", [category, type, output]) as Promise<
      Deploy.Knowability
    >;
  }
}

class SubprocessKit implements Deploy.Kit {
  /** The kit's provisioner set is fixed, so it is asked for once: resolving a workload asks for it per resource. */
  private provisionerSet: Promise<Deploy.ProvisionerSet> | undefined;

  constructor(
    private readonly host: KitHost,
    capabilities: { watchCommand: boolean; emulateExternals: boolean },
  ) {
    if (capabilities.watchCommand) {
      this.watchCommand = (artifactPath: string, name: string) =>
        this.host.call("kit", "watchCommand", [
          artifactPath,
          name,
        ]) as Promise<readonly string[] | undefined>;
    }
    if (capabilities.emulateExternals) {
      this.emulateExternals = (workload: Deploy.Workload) =>
        this.host.call("kit", "emulateExternals", [
          workload,
        ]) as Promise<readonly Deploy.ExternalEmulation[]>;
    }
  }

  watchCommand?: Deploy.Kit["watchCommand"];
  emulateExternals?: Deploy.Kit["emulateExternals"];

  provisioners(): Promise<Deploy.ProvisionerSet> {
    this.provisionerSet ??= this.loadProvisioners();
    return this.provisionerSet;
  }

  private async loadProvisioners(): Promise<Deploy.ProvisionerSet> {
    const { count } = await this.host.call("kit", "$provisionersCount", []) as {
      count: number;
    };
    return await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const capabilities = await this.host.call(
          `provisioner:${index}`,
          "$describe",
          [],
        ) as { describe: boolean; provision: boolean };
        return new SubprocessProvisioner(
          this.host,
          index,
          capabilities,
        );
      }),
    );
  }

  realization(): Promise<Deploy.Realization> {
    return Promise.resolve(
      new SubprocessRealization(this.host),
    );
  }

  present(
    artifacts: Deploy.Render.Artifacts,
    graph: Deploy.Resolve.DependencyGraph,
  ): Promise<Deploy.Render.PresentedArtifact> {
    return this.host.call("kit", "present", [
      artifacts,
      serializeDependencyGraph(graph),
    ]) as Promise<Deploy.Render.PresentedArtifact>;
  }

  applyCommand(artifactPath: string, name: string): Promise<readonly string[]> {
    return this.host.call("kit", "applyCommand", [
      artifactPath,
      name,
    ]) as Promise<readonly string[]>;
  }
}

/**
 * The real `Deploy.KitLoader`: every `Kit`/`Realization`/`Provisioner` method
 * call goes to a `deno run` process serving the vendored kit, started from a
 * small wrapper written next to the kit's own `main.ts` (see
 * `deploy-kit-rpc-wrapper.ts`) — never an in-process `import()`, which can't
 * work correctly once `ens` itself is `deno compile`d (a compiled binary
 * can't embed a module graph it can only discover at runtime, and refuses to
 * read arbitrary local files off the real filesystem for `import()`,
 * verified empirically). One process per loaded kit serves all of its calls
 * (`KitHost`); it never keeps `ens` running, and `close()` ends it sooner.
 * Lives here rather than in kit-sdk because it needs `@ensemble/host`'s
 * deno-executable resolution, matching `SubprocessPackKitGateway`.
 */
export class SubprocessKitLoader implements Deploy.KitLoader {
  private readonly hosts: KitHost[] = [];

  constructor(
    private readonly layering: Deploy.KitConfigLayering = new CoreDeploy
      .KitConfigLayering(),
  ) {}

  async load(
    vendoredDir: string,
    sidecarConfigPaths: readonly string[] = [],
  ): Promise<Deploy.LoadedKit> {
    const mainPath = join(vendoredDir, "main.ts");
    if (!await exists(mainPath, { isFile: true })) {
      throw new CoreDeploy.KitLoadError(
        `No kit found at "${vendoredDir}" (expected ${mainPath}).`,
      );
    }

    const host = new KitHost(vendoredDir, await resolveDenoExecutable());
    this.hosts.push(host);
    const capabilities = await host.call(
      "kit",
      "$describe",
      [],
    ) as { watchCommand: boolean; emulateExternals: boolean };
    const kit = new SubprocessKit(host, capabilities);

    return await this.layering.apply(kit, sidecarConfigPaths);
  }

  /** Ends every kit process this loader started. */
  async close(): Promise<void> {
    await Promise.all(this.hosts.map((host) => host.close()));
  }
}
