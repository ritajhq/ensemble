import { join } from "@std/path";
import { exists } from "@std/fs";
import type { LibDeclaration } from "./lib-declaration.ts";
import { LibKit } from "./lib-kit.ts";
import type { Ports } from "./ports.ts";

/** One core library discovered for a release run, alongside its declaration. */
export interface CoreLibRelease {
  readonly libRoot: string;
  readonly declaration: LibDeclaration;
}

/**
 * Publishes every discovered core library's declared `publish` entries under
 * the release ceremony's already-computed version — invoked alongside the
 * ship cascade, sharing its version, in `ReleaseCeremony`. Deliberately
 * never touches `SelfContainmentChecker`: core libraries are exempt from the
 * self-containment check entirely (Section 1), so this cascade has no
 * dependency on it at all, not even one it chooses not to call.
 */
export class CoreLibReleaseCascade {
  constructor(
    private readonly ports: Ports,
    private readonly libKitFor: (kit: string) => LibKit = (kit) =>
      new LibKit(kit, ports),
  ) {}

  /** Stamps every discovered core library's manifest with `version`, ahead of the release commit that gets tagged — see `ReleaseCeremony.stampCoreLibs`. */
  async stamp(
    version: string,
    libs: readonly CoreLibRelease[],
  ): Promise<void> {
    await this.stampOwnVersions(version, libs);
    await this.pinInterLibDependencies(version, libs);
    for (const { libRoot, declaration } of libs) {
      for (const entry of declaration.publish) {
        await this.libKitFor(entry.kit).stamp({
          libRoot,
          package: declaration.package,
          version,
          target: entry.target,
        });
      }
    }
  }

  /**
   * Writes `version` straight into every discovered core library's own
   * `deno.json`, before any lib kit subprocess runs — including that same
   * library's own `stamp`. A lib kit invocation always resolves its full
   * module graph (via `@ensemble/kit-sdk`) just to start up, and that graph
   * reads every workspace member's on-disk version; if the very first
   * library's own subprocess ran before this, it would see a workspace
   * where `pinInterLibDependencies` already repinned its dependents to the
   * new version but its own manifest still carries the old one — the same
   * kind of mismatch `pinInterLibDependencies` exists to prevent, just
   * pointed at itself. Ordinarily redundant with what the `jsr` lib kit's
   * own `stamp` does to the same file, but not every lib kit necessarily
   * stamps a `deno.json` (a hypothetical `npm` kit would stamp its own
   * `package.json` instead), so this can't replace the per-kit stamp step —
   * only run ahead of it, for the sake of workspace resolution alone.
   */
  private async stampOwnVersions(
    version: string,
    libs: readonly CoreLibRelease[],
  ): Promise<void> {
    for (const { libRoot, declaration } of libs) {
      const denoJsonPath = join(libRoot, "deno.json");
      if (!await exists(denoJsonPath, { isFile: true })) continue;

      const denoJson = JSON.parse(
        await Deno.readTextFile(denoJsonPath),
      ) as Record<
        string,
        unknown
      >;
      denoJson.name = declaration.package;
      denoJson.version = version;
      await Deno.writeTextFile(
        denoJsonPath,
        `${JSON.stringify(denoJson, null, 2)}\n`,
      );
    }
  }

  /**
   * Repins every discovered core library's own `imports` that point at
   * *another* discovered core library, to `version` — before any lib kit
   * runs. A lib kit invocation (e.g. `jsr`'s) spawns a subprocess whose
   * module graph resolves the target library's own dependencies as part of
   * just starting up; once one core library's workspace version moves past
   * what a sibling still pins (e.g. `^0.13.0` after the sibling bumped to
   * `0.14.0`), Deno stops linking the sibling locally and falls back to
   * whatever that version resolves to on the real registry — which for a
   * library not yet published there (as opposed to one merely behind) fails
   * outright. Doing every repin up front, before the stamp loop below runs
   * any subprocess, keeps the workspace internally consistent throughout.
   */
  private async pinInterLibDependencies(
    version: string,
    libs: readonly CoreLibRelease[],
  ): Promise<void> {
    const packages = new Set(libs.map((lib) => lib.declaration.package));
    for (const { libRoot } of libs) {
      const denoJsonPath = join(libRoot, "deno.json");
      if (!await exists(denoJsonPath, { isFile: true })) continue;

      const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath)) as {
        imports?: Record<string, string>;
      };
      const imports = denoJson.imports;
      if (!imports) continue;

      let changed = false;
      for (const [specifier, target] of Object.entries(imports)) {
        const dependency = [...packages].find((pkg) =>
          target.startsWith(`jsr:${pkg}@`)
        );
        if (!dependency) continue;
        const pinned = `jsr:${dependency}@^${version}`;
        if (target === pinned) continue;
        imports[specifier] = pinned;
        changed = true;
      }
      if (!changed) continue;

      await Deno.writeTextFile(
        denoJsonPath,
        `${JSON.stringify(denoJson, null, 2)}\n`,
      );
    }
  }

  async publish(
    version: string,
    libs: readonly CoreLibRelease[],
    onPublished?: (lib: CoreLibRelease) => void | Promise<void>,
  ): Promise<void> {
    for (const lib of libs) {
      const { libRoot, declaration } = lib;
      for (const entry of declaration.publish) {
        await this.libKitFor(entry.kit).publish({
          libRoot,
          package: declaration.package,
          version,
          target: entry.target,
        });
      }
      await onPublished?.(lib);
    }
  }
}
