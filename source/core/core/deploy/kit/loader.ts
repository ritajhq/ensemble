import { join, toFileUrl } from "@std/path";
import { exists } from "@std/fs";
import type { Kit } from "./kit.ts";
import { KitConfigLayering } from "./config-layering.ts";

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
 * Loads/configures a vendored deploy kit for a deployment — one interface,
 * two implementations: `InProcessKitLoader` here (in-process `import()`,
 * kept for fixture-based unit tests) and `SubprocessKitLoader`
 * (`@ensemble/host`, the real one the CLI uses — spawns each kit call as its
 * own fresh `deno run` subprocess, which is what actually works once `ens`
 * itself is `deno compile`d; see that class's doc comment for why in-process
 * loading can't).
 */
export interface KitLoader {
  load(
    vendoredDir: string,
    sidecarConfigPaths?: readonly string[],
  ): Promise<LoadedKit>;
}

/**
 * Loads a vendored kit checkout (pristine, tag-pinned — never edited in
 * place, Section 10) by importing its `main.ts` in-process — the same
 * in-process contract the old `Kit`/`KitProcedure` shape used, kept because a
 * deploy kit needs to hand back an object the rest of resolution calls
 * directly, not a subprocess result. Then layers any sidecar project config
 * files (given lowest-precedence-first, always outside the vendored
 * directory) on top via `KitConfigMerger`/`KitConfigLayering` to produce the
 * effective `Kit` the resolution agents actually consume — the vendored
 * checkout itself is never touched.
 */
export class InProcessKitLoader implements KitLoader {
  constructor(
    private readonly layering: KitConfigLayering = new KitConfigLayering(),
  ) {}

  /** Throws `KitLoadError` if `vendoredDir/main.ts` doesn't exist or doesn't default-export a `Kit`-shaped object. */
  async load(
    vendoredDir: string,
    sidecarConfigPaths: readonly string[] = [],
  ): Promise<LoadedKit> {
    const kit = await this.importKit(vendoredDir);
    return await this.layering.apply(kit, sidecarConfigPaths);
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
}
