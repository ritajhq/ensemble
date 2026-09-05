import { join } from "@std/path";
import { exists } from "@std/fs";
import { load as loadEnv } from "@std/dotenv";
import { $ } from "@david/dax";
import { findRepoRoot } from "./repo.ts";
import { resolveDenoExecutable } from "./deno-exe.ts";
import * as KitSdk from "@ensemble/kit-sdk";

/** Untracked env file holding publish-target credentials (registry passwords, GH_TOKEN, …). Loaded into the publish kit's process environment, never onto its argv. */
export const PUBLISH_ENV_PATH = ".ensemble/publish.env";

export interface RunPublishOptions {
  /** Which named publish target to run, declared in the pack kit's own `kit.yml` "publish" map. */
  target: string;
  /** The name to publish the artifact under (kit-owned meaning — image name, release asset name, …). Defaults to `outputName`, then the ship name. */
  packageName?: string;
  /** Publish options handed to the kit's `publish.ts` (the delivery `publish:` block's properties other than target/name, e.g. `{ registry }`). */
  options?: Record<string, string>;
  /** Name of the local packed artifact the kit resolves its input from. Defaults to the ship name. */
  outputName?: string;
  /** Version to publish this artifact under. Defaults to "latest". */
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
  const packageName = options.packageName ?? outputName;
  const version = options.version ?? "latest";
  const publishOptions = options.options ?? {};
  const varOverrides = options.varOverrides ?? {};

  // Credentials for publish targets (registry passwords, GH_TOKEN, …) live in
  // an untracked .ensemble/publish.env and are handed to the kit through its
  // process environment — never via --vars/argv, which would leak them into
  // `ps` and any logging of the spawned command line.
  const credentials = await loadEnv({
    envPath: join(repoRoot, PUBLISH_ENV_PATH),
    export: false,
  });
  const env = { ...credentials, ...varOverrides };

  // --minimum-dependency-age 0: see the identical flag in pack.ts.
  const result = await $`${denoExe} run -A -q --minimum-dependency-age 0 ${kitEntry}
    --name ${shipName}
    --output-name ${outputName}
    --package-name ${packageName}
    --version ${version}
    --options ${JSON.stringify(publishOptions)}
    --vars ${JSON.stringify(varOverrides)}`
    .cwd(kitDir)
    .env(env)
    .noThrow();

  return result.code;
}
