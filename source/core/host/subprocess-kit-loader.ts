import { join } from "@std/path";
import { exists } from "@std/fs";
import type { Deploy } from "@ensemble/core";
import { Deploy as CoreDeploy } from "@ensemble/core";
import { resolveDenoExecutable } from "./deno-exe.ts";
import { DEPLOY_KIT_WRAPPER_SOURCE } from "./deploy-kit-rpc-wrapper.ts";

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

/** One `{target, method, args}` call into a freshly-spawned wrapper process co-located with the vendored kit — see `deploy-kit-rpc-wrapper.ts` for why co-location (not the kit's own path alone) is what makes resolution correct, and why this is a fresh spawn per call rather than a persistent process. */
async function callKit(
  vendoredDir: string,
  denoExe: string,
  target: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const wrapperPath = await Deno.makeTempFile({
    dir: vendoredDir,
    suffix: ".ts",
  });
  try {
    await Deno.writeTextFile(wrapperPath, DEPLOY_KIT_WRAPPER_SOURCE);
    const command = new Deno.Command(denoExe, {
      args: ["run", "-A", "-q", "--minimum-dependency-age", "0", wrapperPath],
      cwd: vendoredDir,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });
    const child = command.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(
      new TextEncoder().encode(JSON.stringify({ target, method, args })),
    );
    await writer.close();
    const output = await child.output();
    if (!output.success) {
      throw new CoreDeploy.KitLoadError(
        new TextDecoder().decode(output.stderr).trim(),
      );
    }
    const stdout = new TextDecoder().decode(output.stdout).trim();
    if (stdout.length === 0) return undefined;
    // The wrapper's own JSON.stringify(result ?? null) collapses `undefined`
    // to `null` on the wire (JSON has no `undefined`) — safe to normalize
    // back here since none of Kit/Realization/Provisioner's return types
    // ever legitimately use `null` as a distinct value from `undefined`.
    const parsed = JSON.parse(stdout);
    return parsed === null ? undefined : parsed;
  } finally {
    await Deno.remove(wrapperPath);
  }
}

class SubprocessProvisioner implements Deploy.Provisioner {
  constructor(
    private readonly vendoredDir: string,
    private readonly denoExe: string,
    private readonly index: number,
    capabilities: { describe: boolean; provision: boolean },
  ) {
    if (capabilities.describe) {
      this.describe = () =>
        callKit(
          this.vendoredDir,
          this.denoExe,
          `provisioner:${this.index}`,
          "describe",
          [],
        ) as Promise<string>;
    }
    if (capabilities.provision) {
      this.provision = (request: Deploy.ResolvedRequest) =>
        callKit(
          this.vendoredDir,
          this.denoExe,
          `provisioner:${this.index}`,
          "provision",
          [request],
        ) as Promise<Deploy.ProvisionOutcome>;
    }
  }

  describe?: Deploy.Provisioner["describe"];
  provision?: Deploy.Provisioner["provision"];

  matches(resource: unknown, runtime?: string): Promise<boolean> {
    return callKit(
      this.vendoredDir,
      this.denoExe,
      `provisioner:${this.index}`,
      "matches",
      [resource, runtime],
    ) as Promise<boolean>;
  }
}

class SubprocessRealization implements Deploy.Realization {
  constructor(
    private readonly vendoredDir: string,
    private readonly denoExe: string,
  ) {}

  private call(method: string, args: unknown[]): Promise<unknown> {
    return callKit(this.vendoredDir, this.denoExe, "realization", method, args);
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
  constructor(
    private readonly vendoredDir: string,
    private readonly denoExe: string,
    capabilities: { watchCommand: boolean; emulateExternals: boolean },
  ) {
    if (capabilities.watchCommand) {
      this.watchCommand = (artifactPath: string, name: string) =>
        callKit(this.vendoredDir, this.denoExe, "kit", "watchCommand", [
          artifactPath,
          name,
        ]) as Promise<readonly string[] | undefined>;
    }
    if (capabilities.emulateExternals) {
      this.emulateExternals = (workload: Deploy.Workload) =>
        callKit(this.vendoredDir, this.denoExe, "kit", "emulateExternals", [
          workload,
        ]) as Promise<readonly Deploy.ExternalEmulation[]>;
    }
  }

  watchCommand?: Deploy.Kit["watchCommand"];
  emulateExternals?: Deploy.Kit["emulateExternals"];

  async provisioners(): Promise<Deploy.ProvisionerSet> {
    const { count } = await callKit(
      this.vendoredDir,
      this.denoExe,
      "kit",
      "$provisionersCount",
      [],
    ) as { count: number };
    return await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const capabilities = await callKit(
          this.vendoredDir,
          this.denoExe,
          `provisioner:${index}`,
          "$describe",
          [],
        ) as { describe: boolean; provision: boolean };
        return new SubprocessProvisioner(
          this.vendoredDir,
          this.denoExe,
          index,
          capabilities,
        );
      }),
    );
  }

  realization(): Promise<Deploy.Realization> {
    return Promise.resolve(
      new SubprocessRealization(this.vendoredDir, this.denoExe),
    );
  }

  present(
    artifacts: Deploy.Render.Artifacts,
    graph: Deploy.Resolve.DependencyGraph,
  ): Promise<Deploy.Render.PresentedArtifact> {
    return callKit(this.vendoredDir, this.denoExe, "kit", "present", [
      artifacts,
      serializeDependencyGraph(graph),
    ]) as Promise<Deploy.Render.PresentedArtifact>;
  }

  applyCommand(artifactPath: string, name: string): Promise<readonly string[]> {
    return callKit(this.vendoredDir, this.denoExe, "kit", "applyCommand", [
      artifactPath,
      name,
    ]) as Promise<readonly string[]>;
  }
}

/**
 * The real `Deploy.KitLoader`: every `Kit`/`Realization`/`Provisioner` method
 * call is its own fresh, one-shot `deno run` subprocess, spawned from a small
 * wrapper written next to the vendored kit's own `main.ts` (see
 * `deploy-kit-rpc-wrapper.ts`) — never an in-process `import()`, which can't
 * work correctly once `ens` itself is `deno compile`d (a compiled binary
 * can't embed a module graph it can only discover at runtime, and refuses to
 * read arbitrary local files off the real filesystem for `import()`,
 * verified empirically). Lives here rather than in kit-sdk because it needs
 * `@ensemble/host`'s deno-executable resolution, matching
 * `SubprocessPackKitGateway`.
 */
export class SubprocessKitLoader implements Deploy.KitLoader {
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

    const denoExe = await resolveDenoExecutable();
    const capabilities = await callKit(
      vendoredDir,
      denoExe,
      "kit",
      "$describe",
      [],
    ) as { watchCommand: boolean; emulateExternals: boolean };
    const kit = new SubprocessKit(vendoredDir, denoExe, capabilities);

    return await this.layering.apply(kit, sidecarConfigPaths);
  }
}
