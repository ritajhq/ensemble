import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import type { Kit } from "./kit.ts";
import type { Workload } from "../workload.ts";
import type { KitConfig } from "./config.ts";
import { parseKitConfig } from "./config-file.ts";
import { KitConfigMerger } from "./config-merger.ts";
import { ConfiguredProvisioner } from "./configured-provisioner.ts";
import { LayeredRealization } from "./layered-realization.ts";
import type { LoadedKit } from "./loader.ts";

/**
 * Layers a project's sidecar config (project-declared provisioners, per-target
 * value overrides, runtime selection) over a raw kit — shared by every
 * `KitLoader` implementation, since sidecar-config layering has nothing to do
 * with how the raw `Kit` itself was loaded (in-process vs. subprocess). A
 * sidecar path that doesn't exist is silently skipped (an optional layer,
 * e.g. a per-developer local override file).
 */
export class KitConfigLayering {
  constructor(
    private readonly merger: KitConfigMerger = new KitConfigMerger(),
  ) {}

  async apply(
    kit: Kit,
    sidecarConfigPaths: readonly string[] = [],
  ): Promise<LoadedKit> {
    const layers = await this.readConfigLayers(sidecarConfigPaths);
    const config = this.merger.merge(layers);
    return {
      kit: await this.configureKit(kit, config),
      runtime: this.effectiveRuntime(config),
    };
  }

  private async readConfigLayers(
    paths: readonly string[],
  ): Promise<KitConfig[]> {
    const layers: KitConfig[] = [];
    for (const path of paths) {
      if (!await exists(path, { isFile: true })) continue;
      layers.push(parseKitConfig(parseYaml(await Deno.readTextFile(path))));
    }
    return layers;
  }

  private async configureKit(kit: Kit, config: KitConfig): Promise<Kit> {
    const projectProvisioners = config.provisionerCatalog.provisioners.map((
      entry,
    ) => new ConfiguredProvisioner(entry));
    const realization = new LayeredRealization(
      config.targetValues,
      await kit.realization(),
    );
    return {
      provisioners: async () => [
        ...projectProvisioners,
        ...(await kit.provisioners()),
      ],
      realization: () => Promise.resolve(realization),
      present: (artifacts, graph) => kit.present(artifacts, graph),
      applyCommand: (artifactPath, name) =>
        kit.applyCommand(artifactPath, name),
      ...(kit.watchCommand
        ? {
          watchCommand: (artifactPath: string, name: string) =>
            kit.watchCommand!(artifactPath, name),
        }
        : {}),
      ...(kit.emulateExternals
        ? {
          emulateExternals: (workload: Workload) =>
            kit.emulateExternals!(workload),
        }
        : {}),
    };
  }

  private effectiveRuntime(config: KitConfig): string | undefined {
    const value = config.selection.runtime;
    return typeof value === "string" ? value : undefined;
  }
}
