import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import { type Deploy, KitProcess } from "@ensemble/core";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import { NativeProcessRunner } from "./process-runner.ts";

/**
 * The real `PackKitGateway`: spawns the named pack kit's `describe.ts`/
 * `verify.ts` and reports back what it prints — the same subprocess-per-kit
 * pattern `runPublish` already uses, but read-only (no build, no publish).
 * Lives here rather than in kit-sdk because it needs `@david/dax` and repo/
 * deno-executable resolution, which kit-sdk (a leaf package `@ensemble/core`
 * depends on, never the reverse) can't depend on.
 */
export class SubprocessPackKitGateway implements Deploy.PackKitGateway {
  async describe(
    releaseName: string,
    release: Deploy.Release,
    artifacts: Deploy.ArtifactsSource,
    version: string,
    deployKit?: string,
  ): Promise<string> {
    const kitDir = await this.resolveEntrypoint(release.kit, "describe");
    const command = await this.commandLine(
      kitDir,
      "describe.ts",
      this.contextArgs(releaseName, release, artifacts, version, deployKit),
    );

    const ref = await $`${command}`
      .cwd(kitDir)
      .text();

    return ref.trim();
  }

  async verify(
    releaseName: string,
    release: Deploy.Release,
    artifacts: Deploy.ArtifactsSource,
    version: string,
    deployKit?: string,
  ): Promise<Deploy.ReleaseAvailability> {
    const kitDir = await this.resolveEntrypoint(release.kit, "verify");
    const command = await this.commandLine(
      kitDir,
      "verify.ts",
      this.contextArgs(releaseName, release, artifacts, version, deployKit),
    );

    const result = await $`${command}`
      .cwd(kitDir)
      .stdout("piped")
      .stderr("piped")
      .noThrow();

    if (result.code === 0) return { available: true };
    return { available: false, detail: result.stderr.trim() || undefined };
  }

  private commandLine(
    kitDir: string,
    entrypoint: string,
    args: readonly string[],
  ): Promise<string[]> {
    return new KitProcess(kitDir, {
      denoExe: { resolveDenoExecutable },
      process: new NativeProcessRunner(),
    }).commandLine(entrypoint, args);
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
    release: Deploy.Release,
    artifacts: Deploy.ArtifactsSource,
    version: string,
    deployKit: string | undefined,
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
      "--artifacts",
      artifacts,
      "--options",
      JSON.stringify(options),
      ...(deployKit ? ["--deploy-kit", deployKit] : []),
    ];
  }
}
