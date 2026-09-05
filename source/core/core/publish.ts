import { join } from "@std/path";
import { exists } from "@std/fs";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import * as KitSdk from "@ensemble/kit-sdk";

export interface RunPublishOptions {
  /** Which named publish target to run, declared in the pack kit's own `kit.yml` "publish" map. */
  target: string;
  /** Name of the local packed artifact to publish. Defaults to the ship name. */
  outputName?: string;
  /** Version to publish this artifact under, alongside its `outputName:latest`. Defaults to "latest". */
  version?: string;
  varOverrides?: Record<string, string>;
}

/**
 * Resolves a pack kit's `publish.ts` entry point by name and spawns it with
 * the standard publish kit CLI contract — the publish counterpart to
 * `runPack`. Operates on an artifact `ens pack` already produced locally
 * (an image tag, typically); it doesn't build or pack anything itself.
 */
export async function runPublish(
  shipName: string,
  kit: string,
  options: RunPublishOptions,
): Promise<number> {
  const repoRoot = await findRepoRoot();

  const kitDir = join(repoRoot, ".ensemble", "kits", "pack", kit);
  const kitEntry = join(kitDir, "publish.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    throw new Error(
      `Pack kit "${kit}" doesn't support publishing (expected ${kitEntry}).`,
    );
  }

  const publishTargets = await KitSdk.Pack.loadPublishModes(kitDir);
  if (!Object.hasOwn(publishTargets, options.target)) {
    const available = Object.keys(publishTargets).join(", ") ||
      "(none declared)";
    throw new Error(
      `Unknown publish target "${options.target}" for pack kit "${kit}". Available: ${available}`,
    );
  }

  const denoExe = await resolveDenoExecutable();
  const outputName = options.outputName ?? shipName;
  const version = options.version ?? "latest";
  const vars = options.varOverrides ?? {};

  // --minimum-dependency-age 0: see the identical flag in pack.ts.
  const result = await $`${denoExe} run -A -q --minimum-dependency-age 0 ${kitEntry}
    --name ${shipName}
    --output-name ${outputName}
    --version ${version}
    --options ${publishTargets[options.target]}
    --vars ${JSON.stringify(vars)}`
    .cwd(kitDir)
    .env(vars)
    .noThrow();

  return result.code;
}
