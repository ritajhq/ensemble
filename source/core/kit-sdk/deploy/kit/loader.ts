import { join, toFileUrl } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import type { Kit } from "./kit.ts";
import type { KitConfig } from "./config.ts";
import { parseKitConfig } from "./config-file.ts";
import { KitConfigMerger } from "./config-merger.ts";
import { ConfiguredProvisioner } from "./configured-provisioner.ts";
import { LayeredRealization } from "./layered-realization.ts";

export class KitLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KitLoadError";
  }
}

/** A vendored kit with its sidecar config already applied, plus the one piece of that config `Target` itself needs to carry forward: the effective `runtime` selection value (Section 5 of the watch/develop plan). */
export interface LoadedKit {
  readonly kit: Kit;
  readonly runtime?: string;
}

/**
 * Loads a vendored kit checkout (pristine, tag-pinned — never edited in
 * place, Section 10) by importing its `main.ts` in-process — the same
 * in-process contract the old `Kit`/`KitProcedure` shape used, kept because a
 * deploy kit needs to hand back an object the rest of resolution calls
 * directly, not a subprocess result. Then layers any sidecar project config
 * files (given lowest-precedence-first, always outside the vendored
 * directory) on top via `KitConfigMerger`, `ConfiguredProvisioner`, and
 * `LayeredRealization` to produce the effective `Kit` the resolution agents
 * actually consume — the vendored checkout itself is never touched.
 */
export class KitLoader {
  constructor(
    private readonly merger: KitConfigMerger = new KitConfigMerger(),
  ) {}

  /** Throws `KitLoadError` if `vendoredDir/main.ts` doesn't exist or doesn't default-export a `Kit`-shaped object. A sidecar path that doesn't exist is silently skipped (an optional layer, e.g. a per-developer local override file). */
  async load(
    vendoredDir: string,
    sidecarConfigPaths: readonly string[] = [],
  ): Promise<LoadedKit> {
    const kit = await this.importKit(vendoredDir);
    const layers = await this.readConfigLayers(sidecarConfigPaths);
    const config = this.merger.merge(layers);
    return {
      kit: this.configure(kit, config),
      runtime: this.effectiveRuntime(config),
    };
  }

  private async importKit(vendoredDir: string): Promise<Kit> {
    const mainPath = join(vendoredDir, "main.ts");
    if (!await exists(mainPath, { isFile: true })) {
      throw new KitLoadError(
        `No kit found at "${vendoredDir}" (expected ${mainPath}).`,
      );
    }

    const module = await import(toFileUrl(mainPath).href);
    const kit = module.default;
    if (!this.isKit(kit)) {
      throw new KitLoadError(
        `${mainPath} must default-export an object with provisioners() and realization() methods.`,
      );
    }
    return kit;
  }

  private isKit(value: unknown): value is Kit {
    return typeof value === "object" && value !== null &&
      typeof (value as Kit).provisioners === "function" &&
      typeof (value as Kit).realization === "function";
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

  private configure(kit: Kit, config: KitConfig): Kit {
    const projectProvisioners = config.provisionerCatalog.provisioners.map((
      entry,
    ) => new ConfiguredProvisioner(entry));
    const realization = new LayeredRealization(
      config.targetValues,
      kit.realization(),
    );
    return {
      provisioners: () => [...projectProvisioners, ...kit.provisioners()],
      realization: () => realization,
      present: (artifacts, graph) => kit.present(artifacts, graph),
      applyCommand: (artifactPath, name) =>
        kit.applyCommand(artifactPath, name),
      ...(kit.watchCommand
        ? {
          watchCommand: (artifactPath: string, name: string) =>
            kit.watchCommand!(artifactPath, name),
        }
        : {}),
    };
  }

  private effectiveRuntime(config: KitConfig): string | undefined {
    const value = config.selection.runtime;
    return typeof value === "string" ? value : undefined;
  }
}
