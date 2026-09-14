import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import type * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";

/**
 * The real `PackKitGateway`: spawns the named pack kit's `describe.ts`/
 * `verify.ts` and reports back what it prints — the same subprocess-per-kit
 * pattern `runPublish` already uses, but read-only (no build, no publish).
 * Lives here rather than in kit-sdk because it needs `@david/dax` and repo/
 * deno-executable resolution, which kit-sdk (a leaf package `@ensemble/core`
 * depends on, never the reverse) can't depend on.
 */
export class SubprocessPackKitGateway implements KitSdk.Deploy.PackKitGateway {
  async describe(
    releaseName: string,
    release: KitSdk.Deploy.Release,
    mode: KitSdk.Deploy.Mode,
    version: string,
  ): Promise<string> {
    const kitDir = await this.resolveEntrypoint(release.kit, "describe");
    const denoExe = await resolveDenoExecutable();

    const ref = await $`${denoExe} run -A -q --minimum-dependency-age 0 ${
      join(kitDir, "describe.ts")
    } ${this.contextArgs(releaseName, release, mode, version)}`
      .cwd(kitDir)
      .text();

    return ref.trim();
  }

  async verify(
    releaseName: string,
    release: KitSdk.Deploy.Release,
    mode: KitSdk.Deploy.Mode,
    version: string,
  ): Promise<KitSdk.Deploy.ReleaseAvailability> {
    const kitDir = await this.resolveEntrypoint(release.kit, "verify");
    const denoExe = await resolveDenoExecutable();

    const result = await $`${denoExe} run -A -q --minimum-dependency-age 0 ${
      join(kitDir, "verify.ts")
    } ${this.contextArgs(releaseName, release, mode, version)}`
      .cwd(kitDir)
      .stdout("piped")
      .stderr("piped")
      .noThrow();

    if (result.code === 0) return { available: true };
    return { available: false, detail: result.stderr.trim() || undefined };
  }

  private async resolveEntrypoint(
    kit: string,
    operation: "describe" | "verify",
  ): Promise<string> {
    const repoRoot = await findRepoRoot();
    const kitDir = join(repoRoot, ".ensemble", "kits", "pack", kit);
    const kitEntry = join(kitDir, `${operation}.ts`);
    if (!await exists(kitEntry, { isFile: true })) {
      throw new Error(
        `Pack kit "${kit}" doesn't support ${operation} (expected ${kitEntry}).`,
      );
    }
    return kitDir;
  }

  private contextArgs(
    releaseName: string,
    release: KitSdk.Deploy.Release,
    mode: KitSdk.Deploy.Mode,
    version: string,
  ): string[] {
    const outputName = release.outputName ?? releaseName;
    const packageName = release.publish?.name ?? outputName;
    const options = release.publish?.options ?? {};

    return [
      "--name",
      releaseName,
      "--output-name",
      outputName,
      "--package-name",
      packageName,
      "--version",
      version,
      "--mode",
      mode,
      "--options",
      JSON.stringify(options),
    ];
  }
}
