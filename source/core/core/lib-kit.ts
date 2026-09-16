import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import type * as KitSdk from "@ensemble/kit-sdk";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";

/**
 * Invokes a named lib kit: spawns its `main.ts` with the standard lib kit
 * CLI contract (`KitSdk.Lib.getContext`) — the same subprocess-per-kit
 * pattern `runPack`/`runBuild` use. A concrete class rather than a port with
 * an implementation behind it: nothing in kit-sdk needs to depend on "some
 * lib kit invoker" as an injected abstraction the way deploy's classes
 * depend on `PackKitGateway`, so there's nothing yet to invert — this is
 * just how `ens` calls a lib kit.
 */
export class LibKit {
  constructor(private readonly kit: string) {}

  async stamp(input: KitSdk.Lib.Context): Promise<void> {
    await this.run("stamp", input, `Stamping "${input.package}" with lib kit "${this.kit}" failed.`);
  }

  async publish(input: KitSdk.Lib.Context): Promise<void> {
    await this.run("publish", input, `Publishing "${input.package}" with lib kit "${this.kit}" failed.`);
  }

  private async run(mode: "stamp" | "publish", input: KitSdk.Lib.Context, failureMessage: string): Promise<void> {
    const repoRoot = await findRepoRoot();
    const kitDir = join(repoRoot, ".ensemble", "kits", "lib", this.kit);
    const kitEntry = join(kitDir, "main.ts");
    if (!await exists(kitEntry, { isFile: true })) {
      throw new Error(`Lib kit "${this.kit}" not found (expected ${kitEntry})`);
    }

    const denoExe = await resolveDenoExecutable();
    const targetArgs = input.target ? ["--target", input.target] : [];

    // --minimum-dependency-age 0: see the identical flag in build.ts/pack.ts.
    const result =
      await $`${denoExe} run -A -q --minimum-dependency-age 0 ${kitEntry} ${mode}
      --lib-root ${input.libRoot}
      --package ${input.package}
      --version ${input.version}
      ${targetArgs}`
        .cwd(kitDir)
        .noThrow();

    if (result.code !== 0) {
      throw new Error(failureMessage);
    }
  }
}
